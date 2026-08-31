import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

_raw_url = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://srlux:changeme@localhost:5432/srlux_premium",
)
# Support both postgresql:// and postgresql+asyncpg://
DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from models import Base as ModelsBase  # noqa: F401 – registers metadata
    async with engine.begin() as conn:
        await conn.run_sync(ModelsBase.metadata.create_all)
