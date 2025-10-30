const API_KEY = "sk-d44901dd515c4bc5b4f46e81d2f5f4e2";
const CHAT_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// 全局变量，用于控制语音状态
window.isVoiceMuted = false;
let ws = null;

document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const welcomeMessage = document.querySelector('.welcome-message');

    // 从本地存储中获取语音状态
    const savedMuteState = localStorage.getItem('xiaoai_voice_muted');
    if (savedMuteState === 'true') {
        window.isVoiceMuted = true;
    }

    // 连接WebSocket服务器
    connectWebSocket();

    // 初始欢迎消息
    setTimeout(() => {
        const welcomeText = '你好！我是小艾，你的专属心理顾问。有什么我可以帮你的吗？';
        addMessage('ai', welcomeText);
        // 播放欢迎语音
        if (!window.isVoiceMuted) {
            synthesizeSpeech(welcomeText);
        }
    }, 1000);

    // 输入框自动调整高度
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 按Enter发送消息
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 添加消息到聊天框
    function addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        if (type === 'user') {
            avatar.innerHTML = '<img src="images/me.png" alt="用户头像">';
        } else {
            avatar.innerHTML = '<img src="images/ai.png" alt="AI头像">';
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = content;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // 显示正在输入状态
    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatBox.appendChild(indicator);
        chatBox.scrollTop = chatBox.scrollHeight;
        return indicator;
    }

    // 发送消息
    window.sendMessage = async function() {
        const message = userInput.value.trim();
        if (!message) return;

        // 添加用户消息
        addMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';

        // 显示正在输入状态
        const typingIndicator = showTypingIndicator();

        try {
            const response = await fetch(CHAT_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "qwen-max",
                    messages: [
                        { role: "system", content: "你是一个温柔、善解人意的心理专家，名字叫小艾，善于安慰和理解用户。" },
                        { role: "user", content: message }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error('请求失败');
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content || "小艾暂时没有回应，请稍后再试。";
            
            // 移除正在输入状态
            typingIndicator.remove();
            
            // 添加AI响应
            addMessage('ai', aiText);
            
            // 合成并播放语音
            if (!window.isVoiceMuted) {
                synthesizeSpeech(aiText);
            }
            
            // 如果欢迎消息还在，就隐藏它
            if (welcomeMessage) {
                welcomeMessage.style.opacity = '0';
                setTimeout(() => {
                    welcomeMessage.style.display = 'none';
                }, 500);
            }

        } catch (error) {
            console.error('Error:', error);
            typingIndicator.remove();
            addMessage('ai', '抱歉，我遇到了一些问题。请稍后再试。');
        }
    }

    // 添加滚动效果
    window.addEventListener('scroll', () => {
        const chatContainer = document.querySelector('.chat-container');
        const rect = chatContainer.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
        
        if (isVisible) {
            chatContainer.style.transform = 'translateY(0)';
            chatContainer.style.opacity = '1';
        }
    });
});

// 连接WebSocket服务器
function connectWebSocket() {
    // 关闭现有连接
    if (ws) {
        ws.close();
    }
    
    // 创建新连接
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('已连接到WebSocket服务器');
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.action === 'audio-ready') {
                // 音频已准备好，播放它
                playAudio(data.filename);
            } else if (data.action === 'error') {
                console.error('语音合成错误:', data.message);
            }
        } catch (error) {
            console.error('处理WebSocket消息时出错:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket连接已关闭，尝试重新连接...');
        // 5秒后尝试重新连接
        setTimeout(connectWebSocket, 5000);
    };
}

// 语音合成函数
function synthesizeSpeech(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket未连接');
        return;
    }
    
    // 生成唯一文件名
    const filename = `speech_${Date.now()}.mp3`;
    
    // 发送合成请求
    ws.send(JSON.stringify({
        action: 'synthesize',
        text: text,
        filename: filename
    }));
}

// 播放音频
function playAudio(filename) {
    if (window.isVoiceMuted) {
        return;
    }
    
    const audio = new Audio(`audio/${filename}`);
    audio.play();
    
    // 播放完成后删除文件
    audio.onended = () => {
        // 这里可以添加删除文件的逻辑，但需要服务器端支持
        // 为了简单起见，我们暂时不删除文件
    };
}

// 停止当前音频播放
window.stopCurrentAudio = function() {
    // 获取所有正在播放的音频元素并停止
    const audios = document.getElementsByTagName('audio');
    for (let i = 0; i < audios.length; i++) {
        audios[i].pause();
        audios[i].currentTime = 0;
    }
};
