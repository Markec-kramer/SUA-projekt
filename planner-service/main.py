from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import os
import psycopg2
import requests
from datetime import datetime

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      
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
def user_exists(user_id: int) -> bool:
    try:
        r = requests.get(f"{USER_SERVICE_URL}/users/{user_id}", timeout=2)
        return r.status_code == 200
    except:
        return False


def course_exists(course_id: int) -> bool:
    try:
        r = requests.get(f"{COURSE_SERVICE_URL}/courses/{course_id}", timeout=2)
        return r.status_code == 200
    except:
        return False


@app.on_event("startup")
def startup_event():
    init_db()


# ========== GET ENDPOINTS ==========

@app.get("/study-sessions", response_model=List[StudySessionOut])
def list_sessions(user_id: Optional[int] = None):
    conn = get_conn()
    cur = conn.cursor()

    if user_id:
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
def get_session(session_id: int):
    conn = get_conn()
    cur = conn.cursor()
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
        raise HTTPException(status_code=404, detail="Session not found")

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
def create_session(session: StudySessionIn):

    if not user_exists(session.user_id):
        raise HTTPException(status_code=400, detail="User ne obstaja")

    if not course_exists(session.course_id):
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
def complete_session(session_id: int):
    conn = get_conn()
    cur = conn.cursor()
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
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session marked as completed"}


# ========== PUT ENDPOINTS ==========

@app.put("/study-sessions/{session_id}", response_model=StudySessionOut)
def update_session(session_id: int, session: StudySessionIn):
    conn = get_conn()
    cur = conn.cursor()
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
        raise HTTPException(status_code=404, detail="Session not found")

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
def reschedule_session(session_id: int, new_start: str, new_end: str):
    conn = get_conn()
    cur = conn.cursor()
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
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session rescheduled"}


# ========== DELETE ENDPOINTS ==========

@app.delete("/study-sessions/{session_id}")
def delete_session(session_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM study_sessions WHERE id=%s", (session_id,))
    conn.commit()
    cur.close()
    conn.close()

    return {"message": "Session deleted"}


@app.delete("/study-sessions")
def delete_all_sessions(user_id: Optional[int] = None):
    conn = get_conn()
    cur = conn.cursor()

    if user_id:
        cur.execute("DELETE FROM study_sessions WHERE user_id=%s", (user_id,))
    else:
        cur.execute("DELETE FROM study_sessions")

    conn.commit()
    cur.close()
    conn.close()

    return {"message": "Sessions deleted"}
