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
      const resultDiv = document.getElementById('result');
      resultDiv.innerHTML = "分析中，请稍候...";
  
      try {
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

        if (res.ok) {
          const data = await res.json();
          resultDiv.innerHTML = "分析结果：" + data.response;
        } else {
          throw new Error("API请求失败");
        }
      } catch (err) {
        console.error("分析失败:", err);
        // 如果没有后端服务，显示友好的提示信息
        resultDiv.innerHTML = `
          <div style="padding: 20px; background: #fff3cd; border-radius: 10px; border: 1px solid #ffc107; margin-top: 20px;">
            <h3 style="color: #856404; margin-top: 0;">⚠️ 图片分析功能需要后端服务支持</h3>
            <p style="color: #856404; line-height: 1.6;">
              此功能需要启动本地后端服务才能使用。<br>
              图片已成功上传并预览，但无法进行心理状态分析。<br>
              <br>
              <strong>如需使用此功能，请启动后端服务（运行在 http://localhost:3000）</strong>
            </p>
          </div>
        `;
      }
    };
  
    reader.readAsDataURL(file);
  }
  
