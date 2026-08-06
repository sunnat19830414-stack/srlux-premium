import React, { createContext, useContext, useState } from 'react'

export type Lang = 'ru' | 'uz'

const RU = {
  catalog: 'Каталог',
  cart: 'Спецификация',
  inStock: 'В наличии',
  outOfStock: 'Нет в наличии',
  addToCart: 'В корзину',
  checkout: 'Отправить на расчёт',
  viewDetails: 'Подробнее',
  noProducts: 'Товары не найдены',
  loading: 'Загрузка...',
  emptyCart: 'Список пока пуст',
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
  placeOrder: 'Отправить на расчёт',
  orderSuccess: 'Заявка принята! Наш инженер свяжется с вами для расчёта и подтверждения комплектации.',
  orderError: 'Ошибка при оформлении. Попробуйте снова.',
  qty: 'шт',
  remove: 'Удалить',
  noImage: 'Нет фото',
  sections: 'секций',
  variant: 'Модификация',
  rights: 'Все права защищены',
  heroTitle: 'Отопление, продуманное как часть интерьера',
  heroSubtitle: 'Дизайнерские радиаторы, полотенцесушители и Wi-Fi термостаты SR Lux — премиальные решения для дома и объекта',
  heroCta: 'Смотреть каталог',
  catalogHeroTitle: 'Каталог оборудования SR Lux',
  catalogHeroSubtitle: 'Радиаторы, полотенцесушители и климат-контроль — выберите категорию или смотрите весь каталог ниже',
  contactUs: 'Связаться с нами',
  phone: 'Телефон',
  address: 'Адрес',
  workHours: 'Режим работы',
  about: 'О компании',
  contacts: 'Контакты',
  delivery: 'Доставка и оплата',
  returns: 'Возврат товара',
  description: 'Описание',
  characteristics: 'Характеристики',
  color: 'Цвет',
  price: 'Цена',
  height: 'Высота',
  columns: 'Колонн',
  panelType: 'Тип',
  allVariants: 'Все варианты',
  priceSum: 'Цена, сум',
  availability: 'Наличие',
  from: 'от',
  upTo: 'до',
  select: 'Выбрать',
  outOfStockShort: 'Нет',
  modelsCount: 'Моделей',
  footerTagline: 'Premium системы отопления и климат-контроля. Официальный дистрибьютор в Узбекистане.',
  footerAddress: 'г. Ташкент, ул. Уста Ширин 111D',
  footerHours: 'Пн–Сб 9:00–18:00',
}

const UZ: typeof RU = {
  catalog: 'Katalog',
  cart: 'Spetsifikatsiya',
  inStock: 'Sotuvda',
  outOfStock: 'Mavjud emas',
  addToCart: 'Savatga',
  checkout: 'Hisob-kitobga yuborish',
  viewDetails: 'Batafsil',
  noProducts: 'Mahsulotlar topilmadi',
  loading: 'Yuklanmoqda...',
  emptyCart: "Ro'yxat hozircha bo'sh",
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
  placeOrder: 'Hisob-kitobga yuborish',
  orderSuccess: "So'rov qabul qilindi! Muhandisimiz hisob-kitob va tarkibni tasdiqlash uchun siz bilan bog'lanadi.",
  orderError: 'Xatolik yuz berdi. Qayta urinib ko\'ring.',
  qty: 'dona',
  remove: 'O\'chirish',
  noImage: 'Rasm yo\'q',
  sections: 'bo\'lim',
  variant: 'Modifikatsiya',
  rights: 'Barcha huquqlar himoyalangan',
  heroTitle: 'Interyeringizning bir qismiga aylanadigan isitish',
  heroSubtitle: 'SR Lux dizaynerlik radiatorlari, sochiq isitgichlari va Wi-Fi termostatlari — uy va obyekt uchun premium yechimlar',
  heroCta: 'Katalogni ko\'rish',
  catalogHeroTitle: 'SR Lux uskunalari katalogi',
  catalogHeroSubtitle: "Radiatorlar, sochiq isitgichlari va iqlim nazorati — kategoriyani tanlang yoki quyida butun katalogni ko'ring",
  contactUs: 'Biz bilan bog\'laning',
  phone: 'Telefon',
  address: 'Manzil',
  workHours: 'Ish vaqti',
  about: 'Kompaniya haqida',
  contacts: 'Aloqa',
  delivery: 'Yetkazib berish va to\'lov',
  returns: 'Mahsulotni qaytarish',
  description: 'Tavsif',
  characteristics: 'Xususiyatlari',
  color: 'Rang',
  price: 'Narx',
  height: 'Balandlik',
  columns: 'Ustunlar',
  panelType: 'Turi',
  allVariants: 'Barcha variantlar',
  priceSum: 'Narxi, so\'m',
  availability: 'Mavjudligi',
  from: 'Narxi',
  upTo: '',
  select: 'Tanlash',
  outOfStockShort: 'Yo\'q',
  modelsCount: 'Modellar',
  footerTagline: 'Premium isitish va iqlim-nazorat tizimlari. O\'zbekistondagi rasmiy distribyutor.',
  footerAddress: "Toshkent sh., Usta Shirin ko'chasi 111D",
  footerHours: 'Du–Shanba 9:00–18:00',
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
