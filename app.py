from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import json
import os
import shutil
import httpx
from pathlib import Path

# FastAPI应用初始化
app = FastAPI(title="心晴小站 API")

# CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务将在所有路由定义后添加

# 密码加密上下文 - 使用pbkdf2_sha256作为备用方案
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    default="pbkdf2_sha256",
    pbkdf2_sha256__default_rounds=29000
)

# JWT配置
SECRET_KEY = "xinqing-xiaozhan-secret-key-2025"  # 生产环境应使用环境变量
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30天

# 用户数据文件路径
USERS_FILE = "users.json"
AVATARS_DIR = "avatars"

# 确保用户数据文件存在
if not os.path.exists(USERS_FILE):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump({}, f, ensure_ascii=False, indent=2)

# 确保头像目录存在
if not os.path.exists(AVATARS_DIR):
    os.makedirs(AVATARS_DIR)


# Pydantic模型
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


# 工具函数
def get_password_hash(password: str) -> str:
    # 限制密码长度，避免bcrypt的72字节限制
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def load_users():
    """加载用户数据"""
    try:
        if not os.path.exists(USERS_FILE):
            # 如果文件不存在，创建空文件
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, ensure_ascii=False, indent=2)
            return {}
        
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # 确保返回的是字典
            if not isinstance(data, dict):
                return {}
            return data
    except json.JSONDecodeError as e:
        print(f"JSON解析错误: {e}")
        # 如果JSON格式错误，备份原文件并创建新文件
        if os.path.exists(USERS_FILE):
            backup_file = f"{USERS_FILE}.backup.{datetime.now().strftime('%Y%m%d%H%M%S')}"
            try:
                shutil.copy2(USERS_FILE, backup_file)
                print(f"已备份损坏的文件到: {backup_file}")
            except:
                pass
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)
        return {}
    except Exception as e:
        print(f"加载用户数据错误: {e}")
        return {}


def save_users(users: dict):
    """保存用户数据"""
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(USERS_FILE) if os.path.dirname(USERS_FILE) else ".", exist_ok=True)
        
        # 先写入临时文件，然后重命名，确保原子性
        temp_file = f"{USERS_FILE}.tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
        
        # 原子性替换
        if os.path.exists(USERS_FILE):
            os.replace(temp_file, USERS_FILE)
        else:
            os.rename(temp_file, USERS_FILE)
    except Exception as e:
        print(f"保存用户数据错误: {e}")
        # 如果保存失败，尝试清理临时文件
        temp_file = f"{USERS_FILE}.tmp"
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存数据失败: {str(e)}"
        )


def get_current_user(authorization: str = None):
    """从token获取当前用户"""
    if not authorization:
        print("DEBUG: 未提供Authorization header")
        return None
    if not authorization.startswith("Bearer "):
        print(f"DEBUG: Authorization格式错误: {authorization[:20]}...")
        return None
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            print("DEBUG: token中未找到用户名")
            return None
        users = load_users()
        if username not in users:
            print(f"DEBUG: 用户 {username} 不存在于数据库中")
            return None
        return username
    except JWTError as e:
        print(f"DEBUG: JWT验证失败: {e}")
        return None
    except Exception as e:
        print(f"DEBUG: 获取用户时发生错误: {e}")
        return None


# API路由
@app.get("/", response_class=HTMLResponse)
async def read_root():
    """主页"""
    if os.path.exists("index.html"):
        return open("index.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="index.html 文件不存在")


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """登录页面"""
    if os.path.exists("register.html"):
        return open("register.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="register.html 文件不存在")


@app.get("/register", response_class=HTMLResponse)
async def register_page():
    """注册页面"""
    if os.path.exists("register.html"):
        return open("register.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="register.html 文件不存在")


@app.get("/profile.html", response_class=HTMLResponse)
async def profile_page():
    """个人信息页面"""
    if os.path.exists("profile.html"):
        return open("profile.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="profile.html 文件不存在")


@app.post("/api/register", response_model=Token)
async def register(user: UserRegister):
    """用户注册"""
    users = load_users()
    
    # 检查用户名是否已存在
    if user.username in users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 检查邮箱是否已存在
    for existing_user in users.values():
        if existing_user.get("email") == user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被注册"
            )
    
    # 创建新用户
    hashed_password = get_password_hash(user.password)
    users[user.username] = {
        "username": user.username,
        "email": user.email,
        "hashed_password": hashed_password,
        "created_at": datetime.now().isoformat(),
        "mood_data": [],
        "garden_data": {
            "water": 50,
            "sun": 50,
            "music": 50,
            "growth": 0,
            "stage": 0,
            "age": 0,
            "moodRecords": 0,
            "lastWater": None,
            "lastSun": None,
            "lastMusic": None,
            "lastFertilizer": None
        }
    }
    save_users(users)
    
    # 生成token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/login", response_model=Token)
async def login(user: UserLogin):
    """用户登录"""
    users = load_users()
    
    if user.username not in users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    stored_user = users[user.username]
    if not verify_password(user.password, stored_user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    # 生成token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/user/me")
async def get_current_user_info(authorization: Optional[str] = Header(None, alias="Authorization")):
    """获取当前用户信息"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录"
        )
    
    username = get_current_user(authorization)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的token"
        )
    
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )
    
    user_data = users[username].copy()
    # 移除敏感信息
    user_data.pop("hashed_password", None)
    
    # 添加头像URL
    if user_data.get("avatar"):
        user_data["avatar"] = f"/avatars/{user_data['avatar']}"
    else:
        # 如果没有头像，使用默认头像
        user_data["avatar"] = "/images/me.png"
    
    return user_data


@app.post("/api/user/avatar")
async def upload_avatar(authorization: Optional[str] = Header(None, alias="Authorization"), file: UploadFile = File(...)):
    """上传用户头像"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录"
        )
    
    username = get_current_user(authorization)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的token"
        )
    
    # 验证文件类型
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能上传图片文件"
        )
    
    # 生成文件名
    file_extension = os.path.splitext(file.filename)[1]
    filename = f"{username}_{datetime.now().strftime('%Y%m%d%H%M%S')}{file_extension}"
    file_path = os.path.join(AVATARS_DIR, filename)
    
    # 保存文件
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # 更新用户数据
    users = load_users()
    if username in users:
        # 删除旧头像
        old_avatar = users[username].get("avatar")
        if old_avatar and os.path.exists(os.path.join(AVATARS_DIR, old_avatar)):
            try:
                os.remove(os.path.join(AVATARS_DIR, old_avatar))
            except:
                pass
        
        users[username]["avatar"] = filename
        save_users(users)
    
    return {"avatar_url": f"/avatars/{filename}", "message": "头像上传成功"}


@app.post("/api/logout")
async def logout():
    """登出（客户端删除token即可）"""
    return {"message": "登出成功"}


# 心情记录API
@app.get("/api/mood/data")
async def get_mood_data(authorization: Optional[str] = Header(None, alias="Authorization")):
    """获取用户心情记录数据"""
    try:
        username = get_current_user(authorization)
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未登录"
            )
        
        users = load_users()
        if username not in users:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        mood_data = users[username].get("mood_data", [])
        return {"mood_data": mood_data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"获取心情数据错误: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取数据失败: {str(e)}"
        )


@app.post("/api/mood/save")
async def save_mood_data(mood_entry: dict, authorization: Optional[str] = Header(None, alias="Authorization")):
    """保存用户心情记录"""
    try:
        username = get_current_user(authorization)
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未登录"
            )
        
        users = load_users()
        if username not in users:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        # 添加时间戳
        if "date" not in mood_entry:
            mood_entry["date"] = datetime.now().isoformat()
        if "id" not in mood_entry:
            mood_entry["id"] = int(datetime.now().timestamp() * 1000)
        
        # 保存心情记录
        if "mood_data" not in users[username]:
            users[username]["mood_data"] = []
        
        users[username]["mood_data"].append(mood_entry)
        save_users(users)
        
        return {"success": True, "message": "心情记录保存成功"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"保存心情数据错误: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存数据失败: {str(e)}"
        )


# 治愈花园API
@app.get("/api/garden/data")
async def get_garden_data(authorization: Optional[str] = Header(None, alias="Authorization")):
    """获取用户治愈花园数据"""
    try:
        username = get_current_user(authorization)
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未登录"
            )
        
        users = load_users()
        if username not in users:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        garden_data = users[username].get("garden_data", {
            "water": 50,
            "sun": 50,
            "music": 50,
            "growth": 0,
            "stage": 0,
            "age": 0,
            "moodRecords": 0,
            "lastWater": None,
            "lastSun": None,
            "lastMusic": None,
            "lastFertilizer": None
        })
        
        # 更新心情记录数量
        mood_data = users[username].get("mood_data", [])
        garden_data["moodRecords"] = len(mood_data)
        
        return {"garden_data": garden_data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"获取花园数据错误: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取数据失败: {str(e)}"
        )


@app.post("/api/garden/save")
async def save_garden_data(garden_data: dict, authorization: Optional[str] = Header(None, alias="Authorization")):
    """保存用户治愈花园数据"""
    try:
        username = get_current_user(authorization)
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未登录"
            )
        
        users = load_users()
        if username not in users:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        # 更新花园数据
        users[username]["garden_data"] = garden_data
        save_users(users)
        
        return {"success": True, "message": "花园数据保存成功"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"保存花园数据错误: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存数据失败: {str(e)}"
        )


# 其他页面的路由（保持原有功能）
@app.get("/ai.html", response_class=HTMLResponse)
async def ai_page():
    """AI对话页面（保持不变）"""
    if os.path.exists("ai.html"):
        return open("ai.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="ai.html 文件不存在")


@app.get("/mood_tracking.html", response_class=HTMLResponse)
async def mood_tracking_page():
    """心情记录页面"""
    if os.path.exists("mood_tracking.html"):
        return open("mood_tracking.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="mood_tracking.html 文件不存在")


@app.get("/bottle.html", response_class=HTMLResponse)
async def bottle_page():
    """漂流瓶页面"""
    if os.path.exists("bottle.html"):
        return open("bottle.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="bottle.html 文件不存在")


@app.get("/bubble_game.html", response_class=HTMLResponse)
async def bubble_game_page():
    """情绪泡泡页面"""
    if os.path.exists("bubble_game.html"):
        return open("bubble_game.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="bubble_game.html 文件不存在")


@app.get("/garden_game.html", response_class=HTMLResponse)
async def garden_game_page():
    """治愈花园页面"""
    if os.path.exists("garden_game.html"):
        return open("garden_game.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="garden_game.html 文件不存在")


@app.get("/psychology_cards.html", response_class=HTMLResponse)
async def psychology_cards_page():
    """心理知识页面"""
    if os.path.exists("psychology_cards.html"):
        return open("psychology_cards.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="psychology_cards.html 文件不存在")


@app.get("/reading.html", response_class=HTMLResponse)
async def reading_page():
    """阳光阅读页面"""
    if os.path.exists("reading.html"):
        return open("reading.html", encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="reading.html 文件不存在")


@app.get("/article{num}.html", response_class=HTMLResponse)
async def article_page(num: int):
    """文章页面"""
    filename = f"article{num}.html"
    if os.path.exists(filename):
        return open(filename, encoding="utf-8").read()
    raise HTTPException(status_code=404, detail="文章不存在")


# AI聊天API代理（避免CORS问题）
@app.post("/api/chat")
async def chat_proxy(request: dict):
    """AI聊天API代理"""
    API_KEY = "sk-d44901dd515c4bc5b4f46e81d2f5f4e2"
    CHAT_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CHAT_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {API_KEY}"
                },
                json=request,
                timeout=30.0
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI服务错误: {str(e)}")


# 保存消息的API（保持原有功能）
@app.post("/save-message")
async def save_message(message: dict):
    """保存漂流瓶消息"""
    messages_dir = Path("messages")
    messages_dir.mkdir(exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    file_path = messages_dir / f"messages_{today}.txt"
    
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(message.get("message", "") + "\n")
    
    return {"success": True}


# 静态文件服务（放在最后，避免路由冲突）
static_dirs = ["css", "images", "audio", "aud", "messages", "avatars"]
for dir_name in static_dirs:
    if os.path.exists(dir_name):
        try:
            app.mount(f"/{dir_name}", StaticFiles(directory=dir_name), name=dir_name)
        except:
            pass

# 提供根目录下的JS、CSS等静态文件
@app.get("/{filename:path}")
async def serve_file(filename: str):
    """提供根目录下的静态文件"""
    # 排除已由mount处理的目录
    if filename.startswith(('css/', 'images/', 'audio/', 'aud/', 'messages/', 'avatars/')):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 排除HTML文件（由专门的路由处理）
    if filename.endswith('.html'):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 排除API路由
    if filename.startswith('api/'):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 检查文件是否存在
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")
    
    if not os.path.isfile(filename):
        raise HTTPException(status_code=404, detail=f"不是文件: {filename}")
    
    # 根据文件类型设置Content-Type
    content_type_map = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
    }
    
    file_ext = os.path.splitext(filename)[1].lower()
    content_type = content_type_map.get(file_ext, 'application/octet-stream')
    
    try:
        with open(filename, 'rb') as f:
            content = f.read()
        return Response(content=content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

