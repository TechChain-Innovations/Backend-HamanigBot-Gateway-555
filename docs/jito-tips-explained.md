# Jito Tips: Повний гайд по MEV на Solana

## Що таке Jito?

**Jito Labs** — це компанія, яка створила інфраструктуру для MEV (Maximal Extractable Value) на Solana. Вони розробили модифікований клієнт валідатора `jito-solana`, який використовують понад **90% валідаторів** мережі Solana.

## Що таке MEV?

**MEV (Maximal Extractable Value)** — це додатковий прибуток, який можна отримати шляхом:
- Переупорядкування транзакцій в блоці
- Вставки власних транзакцій перед/після інших
- Виключення певних транзакцій

### Приклади MEV:
| Тип | Опис |
|-----|------|
| **Арбітраж** | Купити дешевше на одній DEX, продати дорожче на іншій |
| **Sandwich Attack** | Вставити свої транзакції до і після великої угоди користувача |
| **Liquidation** | Першим ліквідувати позицію і отримати премію |
| **Frontrunning** | Побачити велику угоду і виконати свою раніше |

## Як працює Jito?

### Традиційна модель (без Jito):
```
Користувач → Транзакція → Mempool → Валідатор → Блок
                              ↑
                    MEV боти бачать транзакції
                    і можуть атакувати
```

### Модель Jito:
```
Користувач → Транзакція + Tip → Jito Block Engine → Валідатор → Блок
                                      ↓
                              Приватний mempool
                              (захист від frontrunning)
```

## Що таке Jito Tip Accounts?

**Jito Tip Accounts** — це спеціальні гаманці, куди користувачі відправляють "чайові" (tips) валідаторам за:

1. **Пріоритетне включення** — ваша транзакція потрапить в блок швидше
2. **Захист від MEV** — транзакція не буде видима в публічному mempool
3. **Bundle гарантії** — кілька транзакцій виконаються атомарно (всі або жодна)

### Офіційні Jito Tip Accounts (8 адрес):

```
96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5
HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe
Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY
ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49
DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh
ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt
DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT
```

> **Важливо:** Вибирайте випадковий акаунт для кожної транзакції, щоб зменшити contention (конкуренцію за один акаунт).

## Як використовувати Jito Tips?

### 1. Додати tip інструкцію до транзакції:

```typescript
import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  // ... інші
];

// Вибрати випадковий tip account
const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];

// Створити tip інструкцію
const tipInstruction = SystemProgram.transfer({
  fromPubkey: payerPublicKey,
  toPubkey: new PublicKey(tipAccount),
  lamports: 0.001 * LAMPORTS_PER_SOL, // 0.001 SOL tip
});

// Додати до транзакції
transaction.add(tipInstruction);
```

### 2. Відправити через Jito Block Engine:

```typescript
// Замість стандартного RPC
const response = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [encodedTransaction],
  }),
});
```

## Скільки платити Tips?

| Сценарій | Рекомендований Tip |
|----------|-------------------|
| Звичайна транзакція | 0.0001 - 0.001 SOL |
| Конкурентна MEV можливість | 0.001 - 0.01 SOL |
| Критична транзакція (ліквідація) | 0.01 - 0.1 SOL |
| Висока конкуренція | Динамічно на основі аукціону |

> **Мінімальний tip:** 1000 lamports (0.000001 SOL)

## Jito Bundles

**Bundle** — це група транзакцій, які виконуються атомарно:

```
Bundle = [Tx1, Tx2, Tx3]
         ↓
Або всі виконуються, або жодна
```

### Переваги Bundles:
- **Атомарність** — складні операції виконуються разом
- **Захист** — транзакції не видно до включення в блок
- **Ефективність** — менше failed транзакцій

### Приклад використання:
```typescript
// Арбітражний bundle
const bundle = [
  buyOnDexA,    // Купити токен на DEX A
  sellOnDexB,  // Продати на DEX B
  tipTransaction, // Tip валідатору
];
```

## Jito в контексті Helius

**Helius** інтегрує Jito через:

1. **Helius Sender** — швидка відправка транзакцій
2. **Regional endpoints** — slc, ewr, lon, fra, ams, sg, tyo
3. **Автоматичні Jito tips** — додаються автоматично

### Конфігурація в hamming_bot_gateway:

```yaml
# conf/rpc/helius.yml
apiKey: 'your-api-key'
useWebSocketRPC: true      # WebSocket для моніторингу
useSender: true            # Helius Sender endpoint
regionCode: 'slc'          # Регіон (Salt Lake City)
jitoTipSOL: 0.001          # Розмір tip в SOL
```

## Статистика Jito (2024-2025)

| Метрика | Значення |
|---------|----------|
| Tips виплачено | $674+ мільйонів |
| Bundled транзакцій | 3+ мільярди |
| Частка REV Solana | ~50% |
| Валідаторів на Jito | 90%+ мережі |
| Середній ріст tips/місяць | 32% |

## Корисні посилання

- [Jito Labs Documentation](https://docs.jito.wtf/)
- [Jito Block Engine API](https://docs.jito.wtf/lowlatencytxnsend/)
- [Jito Foundation](https://www.jito.network/)
- [Helius RPC](https://helius.dev/)

## Глосарій

| Термін | Визначення |
|--------|------------|
| **MEV** | Maximal Extractable Value — додатковий прибуток від маніпуляцій з порядком транзакцій |
| **Tip** | Чайові валідатору за пріоритетне включення транзакції |
| **Bundle** | Група транзакцій, що виконуються атомарно |
| **Block Engine** | Сервіс Jito для прийому та обробки bundles |
| **Searcher** | Бот, який шукає MEV можливості |
| **Validator** | Вузол мережі, що створює блоки |
| **Lamports** | Найменша одиниця SOL (1 SOL = 1,000,000,000 lamports) |

---

*Документ створено: 2025-12-27*
*Автор: Claude Code*
