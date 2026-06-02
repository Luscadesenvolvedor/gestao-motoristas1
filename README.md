# Gestão de Motoristas

Aplicação web completa para gestão de motoristas, solicitações, vales, férias e controle financeiro.

## Stack

- **Frontend**: React + Vite + React Router + Axios
- **Backend**: Node.js + Express + PostgreSQL (via Prisma ORM)
- **Deploy**: Vercel (frontend) + Railway (backend + banco)
- **Auth**: JWT + bcrypt

## Estrutura

```
gestao-motoristas/
├── backend/          # API Node.js + Express
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   └── models/
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
└── frontend/         # React + Vite
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   ├── contexts/
    │   └── services/
    └── package.json
```

## Como rodar localmente

### Backend

```bash
cd backend
cp .env.example .env
# Edite .env com sua DATABASE_URL e JWT_SECRET
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Edite VITE_API_URL=http://localhost:3001
npm install
npm run dev
```

## Deploy

### Railway (Backend + PostgreSQL)

1. Crie conta em [railway.app](https://railway.app)
2. Novo projeto → "Deploy from GitHub repo" → selecione a pasta `backend`
3. Adicione um serviço PostgreSQL no mesmo projeto
4. Configure as variáveis de ambiente (veja `.env.example`)
5. O Railway detecta automaticamente o Node.js e faz o deploy

### Vercel (Frontend)

1. Crie conta em [vercel.com](https://vercel.com)
2. "Add New Project" → importe o repositório → selecione a pasta `frontend`
3. Configure `VITE_API_URL` com a URL do Railway
4. Deploy automático

## Variáveis de ambiente

### Backend `.env`
```
DATABASE_URL=postgresql://user:pass@host:5432/gestao_motoristas
JWT_SECRET=sua_chave_super_secreta_aqui
PORT=3001
NODE_ENV=production
```

### Frontend `.env`
```
VITE_API_URL=https://seu-backend.railway.app
```

## Usuário padrão (seed)

```
Email: admin@empresa.com
Senha: admin123
```

## Permissões por perfil

| Aba                  | admin | guichê | acertador | dgp | financeiro |
|----------------------|-------|--------|-----------|-----|------------|
| Usuários             | ✅ rw  | ❌      | ❌         | ❌   | ❌          |
| Motoristas           | ✅ rw  | ✅ rw   | ✅ rw      | ✅ rw| ✅ rw       |
| Solicitação          | ✅ rw  | ✅ rw   | ✅ rw      | ✅ rw| ✅ rw       |
| Exclusão de Vales    | ✅ rw  | ❌      | ✅ rw      | ❌   | ✅ rw       |
| Folgas               | ✅ rw  | ✅ r    | ✅ r       | ✅ r | ✅ rw       |
| Férias               | ✅ rw  | ✅ r    | ✅ r       | ✅ rw| ✅ r        |
| Agendamento          | ✅ rw  | ✅ rw   | ❌         | ❌   | ❌          |
| Controle Financeiro  | ✅ rw  | ❌      | ✅ rw      | ❌   | ❌          |

- `rw` = leitura e escrita
- `r` = somente leitura
- Auditoria (quem alterou + horário) visível apenas para admin
