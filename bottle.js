// 预设的温暖消息
let messages = [
    "愿你被这个世界温柔以待。",
    "别担心，一切都会好起来的。",
    "把烦恼写进风里，让海浪带走它。",
    "生活虽不易，但请保持微笑。",
    "黑夜过后，黎明终会到来。",
    "你比想象中更加坚强。"
];

// 动画状态控制
let isAnimating = false;

function throwBottle() {
    if (isAnimating) return;
    
    const text = document.getElementById("message").value.trim();
    if (text === "") {
        showToast("请写下你想说的话~");
        return;
    }

    // 保存消息到文件
    const now = new Date();
    const timestamp = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const messageWithTimestamp = `[${timestamp}] ${text}`;
    
    // 使用XMLHttpRequest替代fetch
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/save-message', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                console.log('消息保存成功');
            } else {
                console.error('保存消息失败:', xhr.status);
            }
        }
    };
    xhr.send('message=' + encodeURIComponent(messageWithTimestamp));

    isAnimating = true;
    messages.push(text);

    const paper = document.getElementById("paper");
    const bottle = document.getElementById("bottle");

    // 添加纸张折叠动画
    paper.style.animation = "foldPaper 1s forwards";
    
    setTimeout(() => {
        paper.style.display = "none";
        bottle.style.opacity = "1";
        bottle.style.animation = "floatAway 3s ease-out forwards";

        // 添加水波纹效果
        createRipple();

        setTimeout(() => {
            bottle.style.opacity = "0";
            bottle.style.animation = "";
            paper.style.display = "flex";
            paper.style.animation = "unfoldPaper 1s forwards";
            document.getElementById("message").value = "";
            isAnimating = false;
            
            showToast("你的心事已随瓶子飘向远方~");
        }, 3000);
    }, 1000);
}

function getBottle() {
    if (isAnimating) return;
    if (messages.length === 0) {
        showToast("海里暂时没有瓶子了~");
        return;
    }

    isAnimating = true;
    const fetched = document.getElementById("fetched-message");
    const bottle = document.createElement("div");
    bottle.className = "bottle-incoming";
    document.querySelector('.ocean-background').appendChild(bottle);

    // 添加水波纹效果
    createRipple();

    // 随机选择消息并从数组中移除
    const randomIndex = Math.floor(Math.random() * messages.length);
    const randomMsg = messages[randomIndex];
    messages.splice(randomIndex, 1);

    setTimeout(() => {
        fetched.innerHTML = `
            <div class="message-header">
                <i class="fas fa-envelope-open-text"></i> 
                你捞到了一个漂流瓶
            </div>
            <div class="message-content">${randomMsg}</div>
        `;
        fetched.style.display = "block";
        fetched.style.animation = "fadeIn 0.5s ease-out";
        
        bottle.remove();

        setTimeout(() => {
            fetched.style.animation = "fadeOut 0.5s ease-out";
            setTimeout(() => {
                fetched.style.display = "none";
                isAnimating = false;
            }, 500);
        }, 5000);
    }, 3000);
}

// 创建水波纹效果
function createRipple() {
    const ripple = document.createElement("div");
    ripple.className = "ripple";
    document.querySelector('.ocean-background').appendChild(ripple);
    
    // 创建多个水波纹效果
    setTimeout(() => {
        const ripple2 = document.createElement("div");
        ripple2.className = "ripple";
        ripple2.style.animationDelay = "0.5s";
        document.querySelector('.ocean-background').appendChild(ripple2);
    }, 200);
    
    // 清理水波纹元素
    setTimeout(() => {
        ripple.remove();
        document.querySelectorAll('.ripple').forEach(r => r.remove());
    }, 2000);
}

// 显示提示消息
function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "fadeOut 0.5s ease-out";
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

// 添加背景音效
function playWaterSound() {
    const audio = new Audio();
    audio.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADQABISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhI//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjM1AAAAAAAAAAAAAAAAJAYAAAAAAAAAQAuyxZJmAAAAAAAAAAAAAAAAAAAA";
    audio.volume = 0.3;
    audio.play();
}

// 初始化页面元素
document.addEventListener('DOMContentLoaded', () => {
    // 给按钮添加水波纹效果
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('div');
            ripple.className = 'button-ripple';
            this.appendChild(ripple);
            
            const rect = this.getBoundingClientRect();
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;
            
            setTimeout(() => ripple.remove(), 1000);
            playWaterSound();
        });
    });
});

// 修改 saveMessageToFile 函数，添加更多错误处理和调试信息
function saveMessageToFile(message) {
    const now = new Date();
    const timestamp = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const messageWithTimestamp = `[${timestamp}] ${message}\n`;
    
    fetch('/api/save-message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: messageWithTimestamp
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('消息保存成功');
        } else {
            console.error('保存失败:', data.error);
        }
    })
    .catch(error => {
        console.error('保存消息失败:', error);
        showToast("消息保存失败，请稍后重试");
    });
}
  