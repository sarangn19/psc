# Kerala PSC Prep App 🏛️

A full-stack adaptive learning platform for Kerala PSC exam preparation.

## Features

### Student App
- **Onboarding** — Select exams, mark chapters already studied
- **Adaptive Learning** — Questions served based on concept mastery in the Kerala PSC knowledge graph (12,000+ concepts)
- **Mark Chapters** — Update which chapters you've covered
- **News & Current Affairs** — Stay updated with PSC-relevant news
- **Performance Dashboard** — Weak zone / Strong zone analysis with charts
- **Report Questions** — Flag errors in questions for admin review

### Admin Dashboard
- **User Research** — Detailed activity logs, session history, chapter performance for every student
- **Reports Management** — Review and resolve question error reports
- **Questions** — Add new questions with concept mapping and difficulty
- **News Management** — Post and manage current affairs content

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Tailwind CSS, Zustand, Recharts |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT |
| Adaptive Engine | Taxonomy knowledge graph (12,000+ nodes: Exam › Subject › Domain › Topic › Concept) |

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Database
```bash
createdb kerala_psc
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DB credentials
npx prisma migrate dev --name init
npx ts-node prisma/import-taxonomy.ts   # imports 12,000+ nodes from the taxonomy project (../taxonomy/data/taxonomy.db)
npx ts-node prisma/seed.ts
npm run dev
```

> `import-taxonomy.ts` reads the taxonomy project's SQLite DB (sibling folder `taxonomy/data/taxonomy.db` by default). Override with `TAXONOMY_DB_PATH` if it lives elsewhere.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Open
- Student App: http://localhost:5173
- API: http://localhost:5000/api/health

## Demo Credentials
- **Student**: demo@student.com / student123
- **Admin**: admin@keralapsc.com / admin123

## Adaptive Learning Algorithm

Uses the **Kerala PSC knowledge graph** (12,000+ nodes in the hierarchy `Exam › Subject › Domain › Topic › Concept`). Each question is mapped to a concept node; the engine targets the user's weakest concepts.

1. Questions are pulled from the user's **learned chapters** only
2. If no chapters selected → defaults to **Current Affairs**
3. Accuracy is aggregated **per concept** from every attempt
4. The engine serves the **weakest concept first** (lowest accuracy, fewest attempts)
5. Within a concept, questions ramp **EASY → MEDIUM → HARD**
6. When a concept reaches **≥80% accuracy on ≥5 attempts** it is considered *mastered* and drops in priority — the engine naturally advances through sibling concepts, then topics, domains, and subjects
7. Concepts mapped only at chapter level fall back to chapter-based grouping
8. Weak zones (< 40% accuracy) are surfaced on the home screen

## Zone Classification
- 🟢 **STRONG** — ≥ 70% accuracy (≥5 attempts)
- 🟡 **MEDIUM** — 40–69% accuracy
- 🔴 **WEAK** — < 40% accuracy
- ⚪ **UNTESTED** — < 5 attempts

## Exams Covered
- LDC (Lower Division Clerk)
- LGS (Last Grade Servant)
- PSC Degree Level
- Police Constable
- HSST
- VEO (Village Extension Officer)

## Subjects per Exam
General Knowledge · Current Affairs · Mathematics · English · Malayalam · General Science
