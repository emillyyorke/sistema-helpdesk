# HelpDesk ✨ — Sistema de Chamados

Projeto pessoal de um sistema completo de gerenciamento de chamados de suporte técnico, com backend em **FastAPI** e frontend em **HTML/CSS/JS puro**.

Site hospedado em: https://emillyyorke.github.io/sistema-chamados/

Feito por **Emilly Yorke**.

---

## ✨ Funcionalidades

### Autenticação e papéis
- Cadastro e login com **JWT** + senhas com **bcrypt**
- 3 papéis: **Solicitante**, **Analista**, **Admin**

### Chamados
- Identificação por **protocolo único**
- Categorias, prioridades (Baixa/Média/Alta/Crítica) e status (Aberto, Em andamento, Aguardando, Resolvido, Fechado)
- **Comentários** com timeline e **histórico de auditoria** automático (quem fez o quê e quando)
- **Filtros e busca** por status, prioridade, categoria, atribuição, **protocolo PTI** e texto livre
- Botão **"Designar a mim"** para analista pegar chamados sem dono
- **Finalizar chamado** com comentário de resolução obrigatório (fica visível em destaque verde pro solicitante)
- Datas exibidas no fuso local do usuário automaticamente

### Base de Conhecimento
- Artigos com título, categoria e conteúdo
- **Links úteis** (uma URL por linha) renderizados como âncoras clicáveis
- **Upload de arquivos** (PDFs, instaladores, imagens, planilhas — máx 20 MB cada)
- Ícones automáticos por tipo de arquivo (📄 PDF, 🖼️ imagem, ⚙️ executável, 📝 documento, 🗜️ zip)
- Busca por título e conteúdo
- Exclusão de anexos individuais ou do artigo inteiro (cascata limpa o disco)

### Telas
- **Solicitante**: tela única "Meus chamados" com abas "Em aberto" / "Encerrados". Não vê dashboard, usuários, nem chamados de outros.
- **Analista**: dashboard com estatísticas, fila de chamados de toda a empresa com filtros (incluindo "Atribuído a"), KB com criação de artigos.
- **Admin**: tudo do analista + página Usuários com seletor de função, contagem de chamados por pessoa e atalho "espiar caixa do analista", botão de excluir chamados.

---

## 📁 Estrutura

```
helpdesk/
├── README.md
├── .gitignore
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── uploads/                # Arquivos da KB (criada automaticamente)
│   └── app/
│       ├── __init__.py
│       ├── database.py         # Config + engine SQLAlchemy
│       ├── models.py           # User, Ticket, Comment, History, Article, Attachment
│       ├── schemas.py          # Validação Pydantic
│       ├── security.py         # JWT + bcrypt + dependências de auth
│       └── main.py             # Rotas FastAPI
└── frontend/
    ├── index.html              # Estrutura da UI
    ├── styles.css              # Paleta lilás/azul/rosa
    ├── config.js               # URL da API (única coisa a mudar no deploy)
    └── app.js                  # Lógica + chamadas fetch
```

---

## 🚀 Rodando localmente

### 1. Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1        # Windows PowerShell
# source venv/bin/activate        # Linux/Mac

pip install -r requirements.txt
copy .env.example .env           # ou cp no Linux
# edite .env e troque SECRET_KEY

uvicorn app.main:app --reload
```

API rodando em `http://localhost:8000` e doc interativa em `http://localhost:8000/docs`.

### 2. Frontend

O frontend é estático. Pra rodar local sem CORS, sirva com qualquer servidor HTTP simples (em outro terminal):

```powershell
cd frontend
python -m http.server 5500
```

Abra `http://localhost:5500`.

### 3. Primeiros passos

1. Acesse o frontend, vá em **Cadastrar** e crie sua conta — você vira admin automático por ser o primeiro.
2. Cadastre outras contas (ou peça pras pessoas se cadastrarem). Todas entram como **solicitante**.
3. Como admin, vá em **Usuários** e troque o papel de quem deve ser analista.
4. Pronto: solicitantes abrem chamados, analistas pegam pra si e resolvem, admin vê tudo.

## 🛡️ Segurança

- Senhas com **bcrypt** (`passlib`)
- **JWT** assinado com `SECRET_KEY` (HS256)
- **CORS** configurável por env var
- Solicitantes só veem/editam os próprios chamados
- Apenas analistas/admins mudam status, prioridade e atribuição
- Apenas admin: deletar chamados, promover usuários, editar chamados finalizados, repassar entre analistas
- Upload de arquivos limitado a 20 MB e restrito a staff
- 
---

## 📋 Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, Pydantic v2, python-jose, passlib + bcrypt, SQLite/PostgreSQL
- **Frontend**: HTML5, CSS3 (custom properties), Vanilla JavaScript, Fetch API
- **Banco de dados**: SQLite (dev) / PostgreSQL (produção)
- **Auth**: JWT bearer tokens

---

Feito por **Emilly Yorke** — 2026
