# SQL Chatbot 아키텍처 설계서

## 1. 시스템 개요

### 1.1 프로젝트 목적
한국어 자연어 질문을 SQL 쿼리로 변환하여 PostgreSQL 데이터베이스를 조회하고, 결과를 사용자 친화적인 형태로 제공하는 AI 기반 데이터 분석 챗봇입니다.

### 1.2 주요 기능
- 한국어 자연어 → SQL 쿼리 자동 변환
- SQL 쿼리 실행 및 결과 테이블 표시
- 대화 기록 관리 및 저장
- 다크/라이트 모드 지원
- 데이터베이스 스키마 조회

### 1.3 기술 스택
| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18, TypeScript, Tailwind CSS |
| 백엔드 | Express.js, Node.js |
| 데이터베이스 | PostgreSQL, Drizzle ORM |
| AI 모델 | Mistral 7B (OpenRouter API) |
| 빌드 도구 | Vite, esbuild |

---

## 2. 시스템 아키텍처

### 2.1 전체 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 (React)                        │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│   Sidebar   │   TopNav    │  ChatInput  │   SqlBlock  │DataTable│
│  (대화목록) │  (탭 네비)  │  (입력창)   │  (SQL표시)  │(결과표) │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴────┬────┘
       │             │             │             │           │
       └─────────────┴──────┬──────┴─────────────┴───────────┘
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      백엔드 서버 (Express)                       │
├─────────────────────────────────────────────────────────────────┤
│  /api/sql-chat     │  /api/tables                               │
│  - AI SQL 생성     │  - 테이블 메타데이터                        │
│  - 쿼리 실행       │                                            │
│  - 결과 요약       │                                            │
└──────────┬─────────┴────────────────────────────────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────────┐
│PostgreSQL│ │ OpenRouter  │
│(Drizzle) │ │ (Mistral AI)│
└─────────┘ └─────────────┘
```

### 2.2 디렉토리 구조

```
project/
├── client/                    # 프론트엔드
│   └── src/
│       ├── components/        # UI 컴포넌트
│       │   ├── Sidebar.tsx    # 사이드바 (대화 목록)
│       │   ├── TopNav.tsx     # 상단 탭 네비게이션
│       │   ├── ChatInput.tsx  # 채팅 입력창
│       │   ├── SqlBlock.tsx   # SQL 코드 블록
│       │   ├── DataTable.tsx  # 결과 테이블
│       │   ├── SettingsPage.tsx   # 설정 페이지
│       │   └── DatabasePage.tsx   # DB 정보 페이지
│       ├── hooks/
│       │   └── use-chat.ts    # 채팅 API 훅
│       ├── pages/
│       │   └── Home.tsx       # 메인 페이지
│       └── lib/
│           └── queryClient.ts # React Query 설정
├── server/                    # 백엔드
│   ├── routes.ts              # API 라우트
│   ├── storage.ts             # 데이터 저장소
│   └── db.ts                  # DB 연결
└── shared/                    # 공유 모듈
    ├── schema.ts              # DB 스키마
    └── routes.ts              # API 스키마
```

---

## 3. 컴포넌트 상세 설계

### 3.1 프론트엔드 컴포넌트

#### 3.1.1 Home (메인 페이지)
```typescript
// 주요 상태 관리
- messages: Message[]           // 현재 대화 메시지
- conversations: Conversation[] // 전체 대화 목록
- activeConversationId: string  // 현재 활성 대화
- activeTab: TabType            // 현재 탭
- isDarkMode: boolean           // 테마 상태
```

**기능:**
- 대화 생성/선택/삭제/이름변경
- localStorage 대화 저장 (최대 20개 대화, 80개 메시지)
- 테마 전환 및 저장

#### 3.1.2 Sidebar (사이드바)
| Props | 타입 | 설명 |
|-------|------|------|
| conversations | Conversation[] | 대화 목록 |
| activeConversationId | string | 현재 대화 ID |
| onNewConversation | () => void | 새 대화 생성 |
| onSelectConversation | (id) => void | 대화 선택 |
| isDarkMode | boolean | 테마 상태 |
| onToggleTheme | () => void | 테마 전환 |

#### 3.1.3 TopNav (상단 네비게이션)
**탭 목록:**
- 채팅 (chat)
- 데이터베이스 (database)
- 설정 (settings)

### 3.2 백엔드 API

#### 3.2.1 POST /api/sql-chat
**요청:**
```json
{
  "message": "가장 비싼 제품 5개 보여줘"
}
```

**응답:**
```json
{
  "answer": "가장 비싼 제품 5개는...",
  "sql": "SELECT * FROM products ORDER BY price DESC LIMIT 5",
  "data": [
    {"id": 1, "name": "Laptop Pro", "price": "1299.99", ...}
  ],
  "error": null
}
```

**처리 흐름:**
1. 사용자 메시지 수신
2. AI 모델로 SQL 생성
3. SQL 실행 (실패 시 폴백 SQL 사용)
4. AI 모델로 결과 요약 생성
5. 응답 반환

#### 3.2.2 GET /api/tables
**응답:**
```json
[
  {
    "name": "products",
    "columns": ["id", "name", "category", "price", "stock", "description"],
    "rowCount": 4
  },
  {
    "name": "sales",
    "columns": ["id", "product_id", "quantity", "total_price", "sale_date"],
    "rowCount": 10
  }
]
```

---

## 4. 데이터베이스 스키마

### 4.1 products 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL | 기본키 |
| name | VARCHAR | 제품명 |
| category | VARCHAR | 카테고리 |
| price | DECIMAL | 가격 |
| stock | INTEGER | 재고 |
| description | TEXT | 설명 |

### 4.2 sales 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL | 기본키 |
| product_id | INTEGER | 제품 FK |
| quantity | INTEGER | 수량 |
| total_price | DECIMAL | 총액 |
| sale_date | TIMESTAMP | 판매일 |

### 4.3 ERD
```
┌─────────────┐       ┌─────────────┐
│  products   │       │    sales    │
├─────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ product_id  │
│ name        │       │ id (PK)     │
│ category    │       │ quantity    │
│ price       │       │ total_price │
│ stock       │       │ sale_date   │
│ description │       └─────────────┘
└─────────────┘
```

---

## 5. AI 통합

### 5.1 모델 정보
- **제공자**: OpenRouter
- **모델**: mistralai/mistral-7b-instruct:free
- **용도**: 자연어 → SQL 변환, 결과 요약

### 5.2 프롬프트 설계

**SQL 생성 프롬프트:**
```
You are a SQL expert assistant. Your ONLY job is to convert 
natural language questions (in Korean or English) into valid 
PostgreSQL queries.

Database Schema:
- products (id, name, category, price, stock, description)
- sales (id, product_id, quantity, total_price, sale_date)

RULES:
1. Output ONLY the SQL query, nothing else
2. Use exact table and column names
3. For price queries, use ORDER BY price DESC/ASC
4. Always use LIMIT for "top N" queries

Examples:
- "가장 비싼 제품 5개" → SELECT * FROM products ORDER BY price DESC LIMIT 5
```

### 5.3 폴백 로직
AI가 유효한 SQL을 생성하지 못할 경우:
- 제품 관련 질문 → `SELECT * FROM products ORDER BY price DESC LIMIT 10`
- 판매 관련 질문 → `SELECT * FROM sales ORDER BY sale_date DESC LIMIT 10`
- 기타 → `SELECT * FROM products LIMIT 10`

---

## 6. 데이터 흐름

### 6.1 채팅 요청 흐름
```
사용자 입력
    │
    ▼
[ChatInput] ──► useChat() 훅
    │
    ▼
POST /api/sql-chat
    │
    ├──► OpenRouter AI (SQL 생성)
    │         │
    │         ▼
    ├──► PostgreSQL (쿼리 실행)
    │         │
    │         ▼
    └──► OpenRouter AI (결과 요약)
              │
              ▼
         응답 반환
              │
              ▼
[Home] ──► messages 상태 업데이트
    │
    ▼
[SqlBlock] + [DataTable] 렌더링
```

### 6.2 대화 저장 흐름
```
메시지 추가/수정
    │
    ▼
useEffect 트리거
    │
    ▼
localStorage 저장
(최대 20개 대화, 80개 메시지)
```

---

## 7. 성능 최적화

### 7.1 프론트엔드
- React Query 캐싱
- Framer Motion 애니메이션 최적화
- localStorage 크기 제한 (대화/메시지 수 제한)

### 7.2 백엔드
- AI 토큰 제한 (SQL 생성: 256, 요약: 512)
- 결과 데이터 미리보기 제한 (10행)
- 폴백 SQL로 빈 응답 방지

### 7.3 저사양 시스템 지원
- Mistral 7B 경량 모델 사용 (무료 티어)
- 최소 토큰 사용으로 응답 시간 단축

---

## 8. 보안 고려사항

### 8.1 환경 변수
| 변수 | 용도 |
|------|------|
| DATABASE_URL | PostgreSQL 연결 |
| AI_INTEGRATIONS_OPENROUTER_API_KEY | AI API 인증 |
| SESSION_SECRET | 세션 암호화 |

### 8.2 SQL 인젝션 방지
- AI 생성 SQL만 실행 (사용자 입력 직접 실행 금지)
- SELECT 쿼리만 허용 (폴백 로직)

---

## 9. 향후 개선 계획

### 9.1 기능 확장
- [ ] 데이터 시각화 차트 추가
- [ ] RAG: 문서 기반 질의응답
- [ ] 쿼리 히스토리 및 즐겨찾기

### 9.2 기술 개선
- [ ] 서버 사이드 대화 저장 (DB)
- [ ] 사용자 인증 및 권한 관리
- [ ] 더 정확한 AI 모델 적용
- [ ] 실시간 쿼리 스트리밍

---

## 10. 버전 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | 2026-01-15 | 초기 아키텍처 설계 |
| 1.1 | 2026-01-15 | UI 오버홀 (사이드바, 탭 네비게이션) |
| 1.2 | 2026-01-15 | AI 프롬프트 개선 및 폴백 로직 추가 |
