# 🔥 SR Lux - Premium E-commerce Platform with Dolibarr Integration

Премиальная платформа электронной коммерции с интеграцией ERP системы Dolibarr.

## ✨ Функции

- ✅ **Синхронизация с Dolibarr** - Автоматическое получение товаров, цен и наличия
- ✅ **Премиальный дизайн** - С вашим брендом SR Lux
- ✅ **Каталог товаров** - С поиском и фильтрами
- ✅ **Корзина** - Управление товарами
- ✅ **Оформление заказа** - Сохранение в Dolibarr
- ✅ **Профиль пользователя** - История заказов
- ✅ **Многоязычность** - RU, UZ, EN
- ✅ **Мобильный дизайн** - Адаптивный интерфейс

## 🏗️ Архитектура

```
srlux-premium/
├── backend/           # FastAPI + Python
│   ├── main.py        # API с интеграцией Dolibarr
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          # React + TypeScript
│   ├── src/
│   │   └── App.tsx    # Главный компонент
│   ├── public_assets/ # Логотипы SR Lux
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml # Production ready
└── README.md
```

## 🚀 Быстрый старт

### Локально (без Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload

# Frontend (в другом терминале)
cd frontend
npm install
npm run dev
```

Откроется на: `http://localhost:5173`

### С Docker

```bash
# Подготовить .env
cp .env.example .env

# Запустить
docker-compose up -d --build

# Проверить
docker-compose ps
```

Будет доступно на: `http://localhost`

## 🔌 Dolibarr Интеграция

```bash
# API URL
https://bollente.uz/api/index.php/

# API Key (уже в .env)
77759613d55e2ae88e3db1202e53f860f2b9a93a

# Проверить статус
curl "https://bollente.uz/api/index.php/status?DOLAPIKEY=77759613d55e2ae88e3db1202e53f860f2b9a93a"
```

## 📊 API Endpoints

```
GET  /api/v1/status         - Статус системы
GET  /api/v1/products       - Список товаров
GET  /api/v1/products/:id   - Товар по ID
GET  /api/v1/categories     - Категории
POST /api/v1/cart           - Создать корзину
POST /api/v1/orders         - Создать заказ
```

## 🎨 Дизайн

- **Основной цвет**: #B8A000 (золотистый из логотипа)
- **Вторичный**: #D4AF37 (светлое золото)
- **Темный**: #2D2D2D
- **Логотипы**: 10 вариантов в `frontend/public_assets/`

## 📱 Мобильный доступ

- Полностью адаптивный дизайн
- Работает на всех устройствах
- PWA-ready

## 🔐 Безопасность

- FastAPI с best practices
- CORS настроена
- Input validation
- Error handling

## 📝 Лицензия

MIT

## 👨‍💻 Автор

Claude Assistant с ❤️

---

**Для помощи**: Используй команду `docker-compose logs -f` для просмотра логов.
