# System Design + Architecture (MVP)

## Overview
MVP architecture prioritizes **instant staff visibility**, **order durability**, and **simple ops controls** (store mode + 86).

### Core Services
- **Voice Service (Telephony + Agent Orchestrator)**
  - Receives inbound call webhooks
  - Streams audio (STT/TTS)
  - Runs dialogue state machine
  - Calls Menu + Order APIs
  - Can warm-transfer to staff
- **Order Service (Source of truth)**
  - Transactional order creation
  - Order status + audit events
  - Writes outbox events for reliable publishing
- **Menu/Store Service**
  - Menu retrieval + availability toggles (86)
  - Store mode controls (open/busy/closed)
- **Realtime Gateway**
  - WebSocket server for staff UI
  - Fans out events to store subscribers
- **Outbox Worker**
  - Publishes outbox events to Redis PubSub/Queue
  - Retries with backoff; marks SENT/FAILED
- **Staff Web App**
  - Orders board + order details + actions
- **Postgres + Redis**

## Mermaid Diagrams

### System Context
```mermaid
flowchart LR
  Caller((Caller Phone)) --> Telco[Telephony Provider]
  Telco --> Voice[Voice Service\n(Telephony + Agent)]
  Voice --> Menu[Menu/Store Service]
  Voice --> Orders[Order Service]
  Orders --> PG[(Postgres)]
  Orders --> Outbox[(Outbox Table)]
  OutboxWorker[Outbox Worker] --> Redis[(Redis PubSub)]
  Redis --> RT[Realtime Gateway\n(WebSockets)]
  RT --> StaffUI[Staff Web App\n(Tablet/Desktop)]
  StaffUI --> Orders
  StaffUI --> Menu
  Voice -->|Warm Transfer| StaffPhone((Staff Phone/Line))
```

### Order Creation Sequence (Happy Path)
```mermaid
sequenceDiagram
  participant C as Caller
  participant T as Telephony Provider
  participant V as Voice Service
  participant M as Menu/Store Service
  participant O as Order Service
  participant DB as Postgres
  participant W as Outbox Worker
  participant R as Realtime Gateway
  participant S as Staff UI

  C->>T: Call store number
  T->>V: Inbound call webhook + media stream
  V->>M: GET menu snapshot + store mode
  loop Take order
    V->>C: Ask item/modifier
    V->>M: Validate item/modifiers/availability
  end
  V->>C: Read-back summary + ask confirmation
  C->>V: "Yes"
  V->>O: POST /orders (Idempotency-Key)
  O->>DB: BEGIN; insert orders + items + event + outbox; COMMIT
  O-->>V: 201 Created (order_id, order_number)
  V->>C: Confirm order number + pickup time
  W->>DB: Poll outbox (pending)
  W->>R: Publish OrderCreated
  R->>S: WS push OrderCreated
  S->>S: Alert + render NEW order
```

### Outbox Reliability Pattern
```mermaid
flowchart TB
  subgraph Tx[Single DB Transaction]
    A[Insert Order] --> B[Insert Order Items]
    B --> C[Insert Order Event (audit)]
    C --> D[Insert Outbox Event]
  end
  D --> E[Outbox Worker retries until published]
  E --> F[Redis PubSub / Queue]
  F --> G[WebSocket Fanout]
```

## Key Design Decisions
- Deterministic **state machine** for the agent; LLM used as a tool within controlled steps.
- **Transactional writes** + **outbox** to guarantee events are eventually delivered.
- **WebSockets** for instant staff updates; **reconnect + catch-up** via events endpoint.
- **Idempotency keys** on order create to prevent duplicates.
