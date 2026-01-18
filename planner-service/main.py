import os
from fastapi import FastAPI, HTTPException, Request, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import psycopg2
import requests
from datetime import datetime
import jwt
import uuid
from logger import initialize_logger, log_info, log_error, close_logger

import pathlib

JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret")
# support RS256 public key via env or file
JWT_PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")
JWT_PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH") or str(pathlib.Path(__file__).resolve().parents[1] / 'auth' / 'public.pem')
if not JWT_PUBLIC_KEY and JWT_PUBLIC_KEY_PATH and pathlib.Path(JWT_PUBLIC_KEY_PATH).exists():
    with open(JWT_PUBLIC_KEY_PATH, 'r', encoding='utf-8') as f:
        JWT_PUBLIC_KEY = f.read()


def get_current_user(request: Request):
    auth = request.headers.get("Authorization")
    if not auth:
        print(f"[AUTH] No Authorization header")
        raise HTTPException(status_code=401, detail="Authorization header required")
    parts = auth.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        print(f"[AUTH] Invalid auth header format: {auth[:50]}")
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = parts[1]
    try:
        if JWT_PUBLIC_KEY:
            print(f"[AUTH] Decoding with RS256, key present: {bool(JWT_PUBLIC_KEY)}, token: {token[:20]}...")
            payload = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=["RS256"])
        else:
            print(f"[AUTH] Decoding with HS256")
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        # attach token to request state for downstream calls
        request.state.token = token
        print(f"[AUTH] Token decoded successfully, user_id: {payload.get('id')}")
        return {"payload": payload, "token": token}
    except jwt.ExpiredSignatureError as e:
        print(f"[AUTH] Token expired: {e}")
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        print(f"[AUTH] Token decode failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

# determine whether to expose docs
SWAGGER_ENABLED = os.getenv('SWAGGER_ENABLED', '0') == '1' or os.getenv('NODE_ENV') == 'development'

if SWAGGER_ENABLED:
    app = FastAPI()
else:
    # disable built-in docs/openapi when not enabled
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

# Correlation ID middleware
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id
    response = await call_next(request)
    response.headers["x-correlation-id"] = correlation_id
    return response

# Metrics reporting middleware
import asyncio
import time
@app.middleware("http")
async def report_metrics(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    response_time_ms = int((time.time() - start_time) * 1000)
    
    # Send metrics asynchronously
    metrics_service_url = os.getenv("METRICS_SERVICE_URL", "http://localhost:4007")
    asyncio.create_task(send_metrics(
        metrics_service_url,
        request.url.path,
        request.method,
        "planner-service",
        response_time_ms,
        request.state.correlation_id
    ))
    
    return response

async def send_metrics(url, endpoint, method, service_name, response_time_ms, correlation_id):
    try:
        requests.post(f"{url}/metrics/record", json={
            "klicanaStoritev": endpoint,
            "method": method,
            "service_name": service_name,
            "response_time_ms": response_time_ms
        }, timeout=2)
    except Exception as e:
        print(f"[{correlation_id}] Failed to record metric: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],      
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Database config
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "user": os.getenv("DB_USER", "planner_service"),
    "password": os.getenv("DB_PASSWORD", "planner_password"),
    "dbname": os.getenv("DB_NAME", "planner_db"),
}

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:4001")
COURSE_SERVICE_URL = os.getenv("COURSE_SERVICE_URL", "http://localhost:4002")


# DB connection helper
def get_conn():
    return psycopg2.connect(**DB_CONFIG)


# Initialize DB (create table)
def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS study_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            title VARCHAR(255) NOT NULL,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'PLANNED'
        );
        """
    )
    conn.commit()
    cur.close()
    conn.close()
    print("Study sessions table ensured")


# Pydantic models
class StudySessionIn(BaseModel):
    user_id: int
    course_id: int
    title: str
    start_time: str  # ISO string
    end_time: str    # ISO string


class StudySessionOut(StudySessionIn):
    id: int
    status: str


# Helpers to check remote services
def user_exists(user_id: int, token: Optional[str] = None) -> bool:
    try:
        r = requests.get(f"{USER_SERVICE_URL}/internal/users/{user_id}/exists", timeout=2)
        return r.status_code == 200 and r.json().get('exists') == True
    except:
        return False


def course_exists(course_id: int, token: Optional[str] = None) -> bool:
    try:
        r = requests.get(f"{COURSE_SERVICE_URL}/internal/courses/{course_id}/exists", timeout=2)
        return r.status_code == 200 and r.json().get('exists') == True
    except:
        return False


@app.on_event("startup")
async def startup_event():
    init_db()
    initialize_logger()


@app.on_event("shutdown")
async def shutdown_event():
    close_logger()


# Health endpoint - public (no auth required)
@app.get("/healthz")
def healthz(request: Request):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        log_info(request.url.path, request.state.correlation_id, "Health check passed")
        return {"status": "ok"}
    except Exception as e:
        log_error(request.url.path, request.state.correlation_id, f"Health check failed: {str(e)}")
        raise HTTPException(status_code=503, detail=f"unavailable: {str(e)}")


# ========== GET ENDPOINTS ==========

@app.get("/study-sessions", response_model=List[StudySessionOut])
def list_sessions(request: Request, user_id: Optional[int] = None, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()

    if user_id:
        log_info(request.url.path, request.state.correlation_id, f"Fetching study sessions for user_id: {user_id}")
        cur.execute(
            """
            SELECT id,user_id,course_id,title,start_time,end_time,status
            FROM study_sessions
            WHERE user_id=%s
            ORDER BY start_time
            """,
            (user_id,),
        )
    else:
        log_info(request.url.path, request.state.correlation_id, "Fetching all study sessions")
        cur.execute(
            """
            SELECT id,user_id,course_id,title,start_time,end_time,status
            FROM study_sessions
            ORDER BY start_time
            """
        )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    log_info(request.url.path, request.state.correlation_id, f"Retrieved {len(rows)} study sessions")
    return [
        StudySessionOut(
            id=r[0],
            user_id=r[1],
            course_id=r[2],
            title=r[3],
            start_time=r[4].isoformat(),
            end_time=r[5].isoformat(),
            status=r[6]
        )
        for r in rows
    ]


@app.get("/study-sessions/{session_id}", response_model=StudySessionOut)
def get_session(request: Request, session_id: int, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    log_info(request.url.path, request.state.correlation_id, f"Fetching study session with id: {session_id}")
    cur.execute(
        """
        SELECT id,user_id,course_id,title,start_time,end_time,status
        FROM study_sessions
        WHERE id=%s
        """,
        (session_id,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        log_error(request.url.path, request.state.correlation_id, f"Study session {session_id} not found")
        raise HTTPException(status_code=404, detail="Session not found")

    log_info(request.url.path, request.state.correlation_id, f"Successfully retrieved study session {session_id}")
    return StudySessionOut(
        id=row[0],
        user_id=row[1],
        course_id=row[2],
        title=row[3],
        start_time=row[4].isoformat(),
        end_time=row[5].isoformat(),
        status=row[6],
    )


# ========== POST ENDPOINTS ==========

@app.post("/study-sessions", response_model=StudySessionOut, status_code=201)
def create_session(request: Request, session: StudySessionIn, current_user=Depends(get_current_user)):

    token = current_user.get('token') if isinstance(current_user, dict) else None

    log_info(request.url.path, request.state.correlation_id, f"Creating study session for user {session.user_id}, course {session.course_id}")

    if not user_exists(session.user_id, token=token):
        log_error(request.url.path, request.state.correlation_id, f"User {session.user_id} does not exist")
        raise HTTPException(status_code=400, detail="User ne obstaja")
    if not course_exists(session.course_id, token=token):
        log_error(request.url.path, request.state.correlation_id, f"Course {session.course_id} does not exist")
        raise HTTPException(status_code=400, detail="Course ne obstaja")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO study_sessions (user_id, course_id, title, start_time, end_time)
        VALUES (%s,%s,%s,%s,%s)
        RETURNING id,user_id,course_id,title,start_time,end_time,status
        """,
        (
            session.user_id,
            session.course_id,
            session.title,
            session.start_time,
            session.end_time,
        ),
    )

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    log_info(request.url.path, request.state.correlation_id, f"Study session created successfully with id {row[0]}")
    return StudySessionOut(
        id=row[0],
        user_id=row[1],
        course_id=row[2],
        title=row[3],
        start_time=row[4].isoformat(),
        end_time=row[5].isoformat(),
        status=row[6],
    )


@app.post("/study-sessions/{session_id}/complete")
def complete_session(request: Request, session_id: int, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    log_info(request.url.path, request.state.correlation_id, f"Marking study session {session_id} as completed")
    cur.execute(
        """
        UPDATE study_sessions
        SET status='COMPLETED'
        WHERE id=%s
        RETURNING id
        """,
        (session_id,),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        log_error(request.url.path, request.state.correlation_id, f"Study session {session_id} not found for completion")
        raise HTTPException(status_code=404, detail="Session not found")

    log_info(request.url.path, request.state.correlation_id, f"Study session {session_id} marked as completed")
    return {"message": "Session marked as completed"}


# ========== PUT ENDPOINTS ==========

@app.put("/study-sessions/{session_id}", response_model=StudySessionOut)
def update_session(request: Request, session_id: int, session: StudySessionIn, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    log_info(request.url.path, request.state.correlation_id, f"Updating study session {session_id}")
    cur.execute(
        """
        UPDATE study_sessions
        SET user_id=%s, course_id=%s, title=%s, start_time=%s, end_time=%s
        WHERE id=%s
        RETURNING id,user_id,course_id,title,start_time,end_time,status
        """,
        (
            session.user_id,
            session.course_id,
            session.title,
            session.start_time,
            session.end_time,
            session_id,
        ),
    )

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        log_error(request.url.path, request.state.correlation_id, f"Study session {session_id} not found for update")
        raise HTTPException(status_code=404, detail="Session not found")

    log_info(request.url.path, request.state.correlation_id, f"Study session {session_id} updated successfully")
    return StudySessionOut(
        id=row[0],
        user_id=row[1],
        course_id=row[2],
        title=row[3],
        start_time=row[4].isoformat(),
        end_time=row[5].isoformat(),
        status=row[6],
    )


@app.put("/study-sessions/{session_id}/reschedule")
def reschedule_session(request: Request, session_id: int, new_start: str, new_end: str, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    log_info(request.url.path, request.state.correlation_id, f"Rescheduling study session {session_id}")
    cur.execute(
        """
        UPDATE study_sessions
        SET start_time=%s, end_time=%s
        WHERE id=%s
        RETURNING id
        """,
        (new_start, new_end, session_id),
    )

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        log_error(request.url.path, request.state.correlation_id, f"Study session {session_id} not found for rescheduling")
        raise HTTPException(status_code=404, detail="Session not found")

    log_info(request.url.path, request.state.correlation_id, f"Study session {session_id} rescheduled successfully")
    return {"message": "Session rescheduled"}


# ========== DELETE ENDPOINTS ==========

@app.delete("/study-sessions/{session_id}")
def delete_session(request: Request, session_id: int, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    log_info(request.url.path, request.state.correlation_id, f"Deleting study session {session_id}")
    cur.execute("DELETE FROM study_sessions WHERE id=%s", (session_id,))
    conn.commit()
    cur.close()
    conn.close()

    log_info(request.url.path, request.state.correlation_id, f"Study session {session_id} deleted successfully")
    return {"message": "Session deleted"}


@app.delete("/study-sessions")
def delete_all_sessions(request: Request, user_id: Optional[int] = None, current_user=Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()

    if user_id:
        log_info(request.url.path, request.state.correlation_id, f"Deleting all study sessions for user {user_id}")
        cur.execute("DELETE FROM study_sessions WHERE user_id=%s", (user_id,))
    else:
        log_info(request.url.path, request.state.correlation_id, "Deleting all study sessions")
        cur.execute("DELETE FROM study_sessions")

    conn.commit()
    cur.close()
    conn.close()

    log_info(request.url.path, request.state.correlation_id, "Sessions deleted successfully")
    return {"message": "Sessions deleted"}
