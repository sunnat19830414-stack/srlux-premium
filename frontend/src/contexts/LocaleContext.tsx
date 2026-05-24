import React, { createContext, useContext, useState } from 'react'

export type Lang = 'ru' | 'uz'

const RU = {
  catalog: 'Каталог',
  cart: 'Корзина',
  inStock: 'В наличии',
  outOfStock: 'Нет в наличии',
  addToCart: 'В корзину',
  checkout: 'Оформить заказ',
  viewDetails: 'Подробнее',
  noProducts: 'Товары не найдены',
  loading: 'Загрузка...',
  emptyCart: 'Корзина пуста',
  total: 'Итого',
  loadMore: 'Показать ещё',
  allCategories: 'Все категории',
  sku: 'Арт.',
  weight: 'Вес',
  kg: 'кг',
  sum: 'сум',
  orderName: 'Ваше имя',
  orderPhone: 'Телефон',
  orderAddress: 'Адрес доставки',
  placeOrder: 'Оформить заказ',
  orderSuccess: 'Заказ принят! Мы свяжемся с вами.',
  orderError: 'Ошибка при оформлении. Попробуйте снова.',
  qty: 'шт',
  remove: 'Удалить',
  noImage: 'Нет фото',
  sections: 'секций',
  variant: 'Модификация',
  rights: 'Все права защищены',
  heroTitle: 'Премиальные системы отопления',
  heroSubtitle: 'Официальный каталог SR Lux — качество, проверенное временем',
  heroCta: 'Смотреть каталог',
  contactUs: 'Связаться с нами',
  phone: 'Телефон',
  address: 'Адрес',
  workHours: 'Режим работы',
}

const UZ: typeof RU = {
  catalog: 'Katalog',
  cart: 'Savat',
  inStock: 'Sotuvda',
  outOfStock: 'Mavjud emas',
  addToCart: 'Savatga',
  checkout: 'Buyurtma berish',
  viewDetails: 'Batafsil',
  noProducts: 'Mahsulotlar topilmadi',
  loading: 'Yuklanmoqda...',
  emptyCart: 'Savat bo\'sh',
  total: 'Jami',
  loadMore: 'Ko\'proq ko\'rsatish',
  allCategories: 'Barcha kategoriyalar',
  sku: 'Maqola.',
  weight: 'Og\'irlik',
  kg: 'kg',
  sum: 'so\'m',
  orderName: 'Ismingiz',
  orderPhone: 'Telefon',
  orderAddress: 'Yetkazib berish manzili',
  placeOrder: 'Buyurtma berish',
  orderSuccess: 'Buyurtma qabul qilindi! Siz bilan bog\'lanamiz.',
  orderError: 'Xatolik yuz berdi. Qayta urinib ko\'ring.',
  qty: 'dona',
  remove: 'O\'chirish',
  noImage: 'Rasm yo\'q',
  sections: 'bo\'lim',
  variant: 'Modifikatsiya',
  rights: 'Barcha huquqlar himoyalangan',
  heroTitle: 'Premium isitish tizimlari',
  heroSubtitle: 'SR Lux rasmiy katalogi — vaqt sinovidan o\'tgan sifat',
  heroCta: 'Katalogni ko\'rish',
  contactUs: 'Biz bilan bog\'laning',
  phone: 'Telefon',
  address: 'Manzil',
  workHours: 'Ish vaqti',
}

const translations = { ru: RU, uz: UZ }

interface LocaleCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: typeof RU
}

const LocaleContext = createContext<LocaleCtx>({
  lang: 'ru',
  setLang: () => {},
  t: RU,
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ru')
  return (
    <LocaleContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
