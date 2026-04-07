"""HelpDesk API — FastAPI."""
import os
import uuid
import random
from typing import Optional, List
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from .database import Base, engine, get_db, settings
from . import models, schemas, security

Base.metadata.create_all(bind=engine)

# Pasta pra arquivos da base de conhecimento
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB

app = FastAPI(
    title="HelpDesk API",
    description="Sistema de gerenciamento de chamados de suporte técnico",
    version="1.2.0",
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ HELPERS ============
def log_history(db: Session, ticket: models.Ticket, actor: models.User, action: str):
    db.add(models.HistoryEntry(ticket_id=ticket.id, actor_id=actor.id, action=action))


def generate_protocol(db: Session) -> str:
    """Gera um protocolo único no formato PTI + 6 dígitos."""
    for _ in range(20):
        code = "PTI" + "".join(random.choices("0123456789", k=6))
        if not db.query(models.Ticket).filter(models.Ticket.protocol == code).first():
            return code
    # Fallback caso (improvável) os 20 sorteios colidam
    return "PTI" + "".join(random.choices("0123456789", k=8))


# ============ AUTH ============
@app.post("/auth/register", response_model=schemas.Token, tags=["auth"])
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(400, "E-mail já cadastrado")
    # Bootstrap: primeiro usuário do sistema vira admin automaticamente.
    # Os demais sempre entram como solicitante; promoção fica a cargo do admin.
    is_first = db.query(models.User).count() == 0
    role = models.Role.ADMIN if is_first else models.Role.SOLICITANTE
    user = models.User(
        name=data.name, email=data.email,
        password_hash=security.hash_password(data.password),
        role=role,
    )
    db.add(user); db.commit(); db.refresh(user)
    token = security.create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/auth/login", response_model=schemas.Token, tags=["auth"])
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not security.verify_password(data.password, user.password_hash):
        raise HTTPException(401, "E-mail ou senha incorretos")
    token = security.create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/auth/me", response_model=schemas.UserOut, tags=["auth"])
def me(user: models.User = Depends(security.get_current_user)):
    return user


# ============ USERS ============
@app.get("/users", response_model=List[schemas.UserOut], tags=["users"])
def list_users(db: Session = Depends(get_db),
               _: models.User = Depends(security.get_current_user)):
    return db.query(models.User).order_by(models.User.name).all()


@app.get("/users/staff", response_model=List[schemas.UserOut], tags=["users"])
def list_staff(db: Session = Depends(get_db),
               _: models.User = Depends(security.get_current_user)):
    return db.query(models.User).filter(
        models.User.role.in_([models.Role.ANALISTA, models.Role.ADMIN])
    ).order_by(models.User.name).all()


@app.get("/users/with-stats", tags=["users"])
def users_with_stats(db: Session = Depends(get_db),
                     _: models.User = Depends(security.require_admin)):
    """Lista de usuários com contagem de chamados (apenas admin)."""
    users = db.query(models.User).order_by(models.User.name).all()
    open_statuses = [models.TicketStatus.ABERTO, models.TicketStatus.EM_ANDAMENTO, models.TicketStatus.AGUARDANDO]
    result = []
    for u in users:
        opened = db.query(func.count(models.Ticket.id)).filter(models.Ticket.requester_id == u.id).scalar() or 0
        assigned_open = db.query(func.count(models.Ticket.id)).filter(
            models.Ticket.assignee_id == u.id,
            models.Ticket.status.in_(open_statuses),
        ).scalar() or 0
        assigned_total = db.query(func.count(models.Ticket.id)).filter(models.Ticket.assignee_id == u.id).scalar() or 0
        result.append({
            "id": u.id, "name": u.name, "email": u.email, "role": u.role.value,
            "created_at": u.created_at.isoformat(),
            "opened_count": opened,
            "assigned_open": assigned_open,
            "assigned_total": assigned_total,
        })
    return result


@app.patch("/users/{user_id}/role", response_model=schemas.UserOut, tags=["users"])
def change_role(user_id: int, role: models.Role,
                db: Session = Depends(get_db),
                admin: models.User = Depends(security.require_admin)):
    u = db.query(models.User).get(user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.id == admin.id:
        raise HTTPException(400, "Você não pode alterar a sua própria função")
    u.role = role
    db.commit(); db.refresh(u)
    return u


@app.delete("/users/{user_id}", status_code=204, tags=["users"])
def delete_user(user_id: int,
                db: Session = Depends(get_db),
                admin: models.User = Depends(security.require_admin)):
    u = db.query(models.User).get(user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.id == admin.id:
        raise HTTPException(400, "Você não pode excluir a si mesmo")
    db.delete(u); db.commit()


# ============ TICKETS ============
@app.post("/tickets", response_model=schemas.TicketDetail, tags=["tickets"])
def create_ticket(data: schemas.TicketCreate,
                  db: Session = Depends(get_db),
                  user: models.User = Depends(security.get_current_user)):
    ticket = models.Ticket(
        protocol=generate_protocol(db),
        title=data.title, description=data.description, category=data.category,
        priority=data.priority, requester_id=user.id, assignee_id=data.assignee_id,
    )
    db.add(ticket); db.flush()
    log_history(db, ticket, user, f"Chamado {ticket.protocol} criado por {user.name}")
    if data.assignee_id:
        target = db.query(models.User).get(data.assignee_id)
        if target:
            log_history(db, ticket, user, f"Atribuído a {target.name}")
    db.commit(); db.refresh(ticket)
    return ticket


@app.get("/tickets", response_model=List[schemas.TicketOut], tags=["tickets"])
def list_tickets(
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
    status_f: Optional[models.TicketStatus] = Query(None, alias="status"),
    priority: Optional[models.Priority] = None,
    category: Optional[str] = None,
    assignee_id: Optional[int] = None,
    mine: bool = False,
    q: Optional[str] = None,
):
    query = db.query(models.Ticket)
    if user.role == models.Role.SOLICITANTE:
        query = query.filter(models.Ticket.requester_id == user.id)
    if mine:
        query = query.filter(or_(
            models.Ticket.requester_id == user.id,
            models.Ticket.assignee_id == user.id,
        ))
    if status_f:
        query = query.filter(models.Ticket.status == status_f)
    if priority:
        query = query.filter(models.Ticket.priority == priority)
    if category:
        query = query.filter(models.Ticket.category == category)
    if assignee_id is not None:
        if assignee_id == 0:
            query = query.filter(models.Ticket.assignee_id.is_(None))
        else:
            query = query.filter(models.Ticket.assignee_id == assignee_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(models.Ticket.title.ilike(like),
                                 models.Ticket.description.ilike(like),
                                 models.Ticket.protocol.ilike(like)))
    return query.order_by(models.Ticket.created_at.desc()).all()


@app.get("/tickets/stats", tags=["tickets"])
def stats(db: Session = Depends(get_db),
          user: models.User = Depends(security.get_current_user)):
    base = db.query(models.Ticket)
    if user.role == models.Role.SOLICITANTE:
        base = base.filter(models.Ticket.requester_id == user.id)
    total = base.count()
    by_status = dict(
        base.with_entities(models.Ticket.status, func.count()).group_by(models.Ticket.status).all()
    )
    by_priority = dict(
        base.with_entities(models.Ticket.priority, func.count()).group_by(models.Ticket.priority).all()
    )
    return {
        "total": total,
        "by_status": {s.value: by_status.get(s, 0) for s in models.TicketStatus},
        "by_priority": {p.value: by_priority.get(p, 0) for p in models.Priority},
    }


@app.get("/tickets/{ticket_id}", response_model=schemas.TicketDetail, tags=["tickets"])
def get_ticket(ticket_id: int,
               db: Session = Depends(get_db),
               user: models.User = Depends(security.get_current_user)):
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404, "Chamado não encontrado")
    if user.role == models.Role.SOLICITANTE and t.requester_id != user.id:
        raise HTTPException(403, "Sem permissão para ver este chamado")
    return t


@app.patch("/tickets/{ticket_id}", response_model=schemas.TicketDetail, tags=["tickets"])
def update_ticket(ticket_id: int, data: schemas.TicketUpdate,
                  db: Session = Depends(get_db),
                  user: models.User = Depends(security.get_current_user)):
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404, "Chamado não encontrado")
    if user.role == models.Role.SOLICITANTE:
        if t.requester_id != user.id:
            raise HTTPException(403, "Sem permissão")
        if data.status or data.assignee_id is not None:
            raise HTTPException(403, "Apenas analistas podem alterar status ou atribuição")

    # Analista só pode mexer em atribuição para "puxar pra si" um chamado sem dono.
    # Repasse entre analistas é exclusivo do admin.
    if user.role == models.Role.ANALISTA and "assignee_id" in data.model_dump(exclude_unset=True):
        new_assignee = data.assignee_id
        is_self_pickup = (new_assignee == user.id and t.assignee_id is None)
        if not is_self_pickup:
            raise HTTPException(403, "Apenas administradores podem repassar chamados entre analistas")

    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        old = getattr(t, k)
        if old == v:
            continue
        setattr(t, k, v)
        if k == "status":
            log_history(db, t, user, f"Status alterado para '{v.value if hasattr(v,'value') else v}'")
            if v == models.TicketStatus.RESOLVIDO:
                t.resolved_at = datetime.utcnow()
        elif k == "assignee_id":
            target = db.query(models.User).get(v) if v else None
            log_history(db, t, user, f"Atribuído a {target.name}" if target else "Atribuição removida")
        elif k == "priority":
            log_history(db, t, user, f"Prioridade alterada para '{v.value if hasattr(v,'value') else v}'")
        else:
            log_history(db, t, user, f"Campo '{k}' atualizado")
    db.commit(); db.refresh(t)
    return t


@app.post("/tickets/{ticket_id}/resolve", response_model=schemas.TicketDetail, tags=["tickets"])
def resolve_ticket(ticket_id: int, data: schemas.TicketResolve,
                   db: Session = Depends(get_db),
                   user: models.User = Depends(security.require_staff)):
    """Finaliza um chamado. Exige um comentário de resolução."""
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404, "Chamado não encontrado")
    if t.status in (models.TicketStatus.RESOLVIDO, models.TicketStatus.FECHADO):
        raise HTTPException(400, "Este chamado já está finalizado")
    t.status = models.TicketStatus.RESOLVIDO
    t.resolution = data.resolution.strip()
    t.resolved_at = datetime.utcnow()
    # Registra também como comentário pra ficar visível na conversa
    db.add(models.Comment(ticket_id=t.id, author_id=user.id,
                          body=f"✅ Resolução: {t.resolution}"))
    log_history(db, t, user, f"Chamado finalizado por {user.name}")
    db.commit(); db.refresh(t)
    return t


@app.delete("/tickets/{ticket_id}", status_code=204, tags=["tickets"])
def delete_ticket(ticket_id: int,
                  db: Session = Depends(get_db),
                  _: models.User = Depends(security.require_admin)):
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404, "Chamado não encontrado")
    db.delete(t); db.commit()


# ============ COMMENTS ============
@app.post("/tickets/{ticket_id}/comments", response_model=schemas.CommentOut, tags=["tickets"])
def add_comment(ticket_id: int, data: schemas.CommentCreate,
                db: Session = Depends(get_db),
                user: models.User = Depends(security.get_current_user)):
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404, "Chamado não encontrado")
    if user.role == models.Role.SOLICITANTE and t.requester_id != user.id:
        raise HTTPException(403, "Sem permissão")
    c = models.Comment(ticket_id=ticket_id, author_id=user.id, body=data.body)
    db.add(c)
    log_history(db, t, user, f"{user.name} comentou")
    db.commit(); db.refresh(c)
    return c


# ============ KNOWLEDGE BASE ============
@app.get("/articles", response_model=List[schemas.ArticleOut], tags=["kb"])
def list_articles(db: Session = Depends(get_db),
                  _: models.User = Depends(security.get_current_user),
                  q: Optional[str] = None,
                  category: Optional[str] = None):
    query = db.query(models.Article)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(models.Article.title.ilike(like),
                                 models.Article.body.ilike(like)))
    if category:
        query = query.filter(models.Article.category == category)
    return query.order_by(models.Article.updated_at.desc()).all()


@app.get("/articles/{article_id}", response_model=schemas.ArticleOut, tags=["kb"])
def get_article(article_id: int, db: Session = Depends(get_db),
                _: models.User = Depends(security.get_current_user)):
    a = db.query(models.Article).get(article_id)
    if not a:
        raise HTTPException(404, "Artigo não encontrado")
    return a


@app.post("/articles", response_model=schemas.ArticleOut, tags=["kb"])
def create_article(data: schemas.ArticleCreate,
                   db: Session = Depends(get_db),
                   user: models.User = Depends(security.require_staff)):
    a = models.Article(**data.model_dump(), author_id=user.id)
    db.add(a); db.commit(); db.refresh(a)
    return a


@app.patch("/articles/{article_id}", response_model=schemas.ArticleOut, tags=["kb"])
def update_article(article_id: int, data: schemas.ArticleUpdate,
                   db: Session = Depends(get_db),
                   user: models.User = Depends(security.require_staff)):
    a = db.query(models.Article).get(article_id)
    if not a:
        raise HTTPException(404, "Artigo não encontrado")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    db.commit(); db.refresh(a)
    return a


@app.delete("/articles/{article_id}", status_code=204, tags=["kb"])
def delete_article(article_id: int, db: Session = Depends(get_db),
                   _: models.User = Depends(security.require_staff)):
    a = db.query(models.Article).get(article_id)
    if not a:
        raise HTTPException(404, "Artigo não encontrado")
    # Remove arquivos do disco
    for att in a.attachments:
        try:
            os.remove(os.path.join(UPLOAD_DIR, att.stored_name))
        except OSError:
            pass
    db.delete(a); db.commit()


@app.post("/articles/{article_id}/attachments", response_model=schemas.AttachmentOut, tags=["kb"])
async def upload_attachment(article_id: int,
                            file: UploadFile = File(...),
                            db: Session = Depends(get_db),
                            _: models.User = Depends(security.require_staff)):
    a = db.query(models.Article).get(article_id)
    if not a:
        raise HTTPException(404, "Artigo não encontrado")

    ext = os.path.splitext(file.filename or "")[1][:20]
    stored = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored)
    size = 0
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE:
                    out.close()
                    os.remove(path)
                    raise HTTPException(413, "Arquivo muito grande (máximo 20 MB)")
                out.write(chunk)
    finally:
        await file.close()

    att = models.Attachment(
        article_id=article_id,
        original_name=file.filename or stored,
        stored_name=stored,
        mime_type=file.content_type or "application/octet-stream",
        size=size,
    )
    db.add(att); db.commit(); db.refresh(att)
    return att


@app.delete("/attachments/{att_id}", status_code=204, tags=["kb"])
def delete_attachment(att_id: int,
                      db: Session = Depends(get_db),
                      _: models.User = Depends(security.require_staff)):
    att = db.query(models.Attachment).get(att_id)
    if not att:
        raise HTTPException(404, "Anexo não encontrado")
    try:
        os.remove(os.path.join(UPLOAD_DIR, att.stored_name))
    except OSError:
        pass
    db.delete(att); db.commit()


@app.get("/", tags=["health"])
def root():
    return {"app": "HelpDesk API", "status": "ok", "docs": "/docs"}