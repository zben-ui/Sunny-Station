const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 3000;

// 中间件
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 允许跨域请求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ port: 8080 });

// 存储API密钥
const API_KEY = "sk-d44901dd515c4bc5b4f46e81d2f5f4e2";
const wsUrl = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

// 确保音频目录存在
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// 创建消息存储目录
const messagesDir = path.join(__dirname, 'messages');
if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir);
}

// 添加保存消息的路由
app.post('/save-message', (req, res) => {
    const message = req.body.message;
    if (!message) {
        return res.status(400).send('No message provided');
    }

    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(messagesDir, `messages_${today}.txt`);

    // 添加换行符确保每条消息独占一行
    fs.appendFile(filePath, message + '\n', (err) => {
        if (err) {
            console.error('写入消息失败:', err);
            return res.status(500).send('Failed to save message');
        }
        console.log('消息已保存到:', filePath);
        res.send('Message saved successfully');
    });
});

// 处理WebSocket连接
wss.on('connection', (ws) => {
  console.log('客户端已连接');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.action === 'synthesize') {
        const { text, filename } = data;
        const outputFilePath = path.join(audioDir, filename);
        
        // 清空或创建文件
        await checkAndClearOutputFile(outputFilePath);
        
        // 创建文件流
        const fileStream = fs.createWriteStream(outputFilePath, { flags: 'a' });
        
        // 创建到阿里云的WebSocket连接
        const dashScopeWs = new WebSocket(wsUrl, {
          headers: {
            Authorization: `bearer ${API_KEY}`,
            'X-DashScope-DataInspection': 'enable'
          }
        });
        
        dashScopeWs.on('open', () => {
          console.log('已连接到阿里云WebSocket服务器');
          sendRunTaskMessage(dashScopeWs, text);
        });
        
        dashScopeWs.on('message', (data, isBinary) => {
          if (isBinary) {
            fileStream.write(data);
          } else {
            const message = JSON.parse(data);
            handleWebSocketEvent(message, dashScopeWs, fileStream, ws, outputFilePath);
          }
        });
        
        dashScopeWs.on('error', (error) => {
          console.error('阿里云WebSocket错误:', error);
          ws.send(JSON.stringify({ action: 'error', message: '语音合成失败' }));
        });
        
        dashScopeWs.on('close', () => {
          console.log('阿里云WebSocket连接已关闭');
        });
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
      ws.send(JSON.stringify({ action: 'error', message: '处理请求时出错' }));
    }
  });
  
  ws.on('close', () => {
    console.log('客户端已断开连接');
  });
});

// 发送任务消息
function sendRunTaskMessage(ws, text) {
  const taskId = uuidv4();
  const runTaskMessage = {
    header: {
      action: 'run-task',
      task_id: taskId,
      streaming: 'out'
    },
    payload: {
      model: 'sambert-zhiwei-v1',
      task_group: 'audio',
      task: 'tts',
      function: 'SpeechSynthesizer',
      input: {
        text: text
      },
      parameters: {
        text_type: 'PlainText',
        format: 'mp3',
        sample_rate: 16000,
        volume: 45,
        rate: 1.0,
        pitch: 1.05,
        word_timestamp_enabled: true,
        phoneme_timestamp_enabled: true
      }
    }
  };
  ws.send(JSON.stringify(runTaskMessage));
  console.log('run-task指令已发送');
}

// 处理WebSocket事件
function handleWebSocketEvent(message, dashScopeWs, fileStream, clientWs, outputFilePath) {
  switch (message.header.event) {
    case 'task-started':
      console.log('任务已启动');
      break;
    case 'result-generated':
      console.log('结果已生成');
      break;
    case 'task-finished':
      console.log('任务已完成');
      dashScopeWs.close();
      fileStream.end(() => {
        console.log('文件流已关闭');
        // 通知客户端音频已准备好
        clientWs.send(JSON.stringify({ 
          action: 'audio-ready', 
          filename: path.basename(outputFilePath) 
        }));
      });
      break;
    case 'task-failed':
      console.error('任务失败：', message.header.error_message);
      dashScopeWs.close();
      fileStream.end(() => {
        console.log('文件流已关闭');
        clientWs.send(JSON.stringify({ 
          action: 'error', 
          message: '语音合成失败: ' + message.header.error_message 
        }));
      });
      break;
    default:
      console.log('未知事件：', message.header.event);
  }
}

// 检查并清空输出文件
function checkAndClearOutputFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.access(filePath, fs.F_OK, (err) => {
      if (!err) {
        fs.truncate(filePath, 0, (truncateErr) => {
          if (truncateErr) return reject(truncateErr);
          console.log('文件已清空');
          resolve();
        });
      } else {
        fs.open(filePath, 'w', (openErr) => {
          if (openErr) return reject(openErr);
          console.log('文件已创建');
          resolve();
        });
      }
    });
  });
}

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// AI聊天页面路由
app.get('/ai', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai.html'));
});

// 音频文件路由
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(audioDir, filename);
  
  // 检查文件是否存在
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('音频文件不存在');
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`小艾已启动：http://localhost:${PORT}`);
});
