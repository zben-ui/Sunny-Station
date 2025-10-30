function analyzeImage() {
    const input = document.getElementById('imageInput');
    const file = input.files[0];
  
    if (!file) {
      alert("请先上传一张图片！");
      return;
    }
  
    const reader = new FileReader();
    reader.onload = async function () {
      const base64Image = reader.result.split(',')[1];
  
      document.getElementById('preview').src = reader.result;
      document.getElementById('result').innerText = "分析中，请稍候...";
  
      const res = await fetch("http://localhost:3000/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          image: base64Image,
          prompt: "请分析这张人物图片中角色的心理状态。"
        })
      });
  
      const data = await res.json();
      document.getElementById('result').innerText = "分析结果：" + data.response;
    };
  
    reader.readAsDataURL(file);
  }
  