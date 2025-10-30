// server.js
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('.')); // 用于服务 html 页面

app.post('/analyze', async (req, res) => {
  const { image, prompt } = req.body;

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llava',
      prompt: prompt,
      images: [image],
      stream: false
    })
  });

  const result = await response.json();
  res.json({ response: result.response });
});

app.listen(port, () => {
  console.log(`服务已启动：http://localhost:${port}`);
});
