"""Schemas Pydantic — validação de entrada e formato de saída da API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from .models import Role, TicketStatus, Priority


# ---------- USER ----------
class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    role: Role = Role.SOLICITANTE


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: Role
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- TICKET ----------
class TicketCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    category: str
    priority: Priority = Priority.MEDIA
    assignee_id: Optional[int] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[Priority] = None
    status: Optional[TicketStatus] = None
    assignee_id: Optional[int] = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentOut(BaseModel):
    id: int
    body: str
    author: UserOut
    created_at: datetime

    class Config:
        from_attributes = True


class HistoryOut(BaseModel):
    id: int
    action: str
    actor: UserOut
    created_at: datetime

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: int
    protocol: str
    title: str
    description: str
    category: str
    priority: Priority
    status: TicketStatus
    resolution: Optional[str] = None
    requester: UserOut
    assignee: Optional[UserOut]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


class TicketResolve(BaseModel):
    resolution: str = Field(min_length=3, description="Comentário de resolução (obrigatório)")


class TicketDetail(TicketOut):
    comments: List[CommentOut] = []
    history: List[HistoryOut] = []


# ---------- ARTICLE ----------
class AttachmentOut(BaseModel):
    id: int
    original_name: str
    stored_name: str
    mime_type: str
    size: int
    created_at: datetime

    class Config:
        from_attributes = True


class ArticleCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: str
    body: str = Field(min_length=3)
    links: Optional[str] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    body: Optional[str] = None
    links: Optional[str] = None


class ArticleOut(BaseModel):
    id: int
    title: str
    category: str
    body: str
    links: Optional[str] = None
    author: UserOut
    created_at: datetime
    updated_at: datetime
    attachments: List[AttachmentOut] = []

    class Config:
        from_attributes = True