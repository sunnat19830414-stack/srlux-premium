const SITE_URL = 'https://srlux.uz'
const SEO_JSONLD_ID = 'seo-jsonld'

interface SeoOptions {
  title: string
  description: string
  path?: string
  image?: string | null
  type?: 'website' | 'product' | 'article'
  jsonLd?: Record<string, unknown> | null
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function setSeo({ title, description, path, image, type = 'website', jsonLd = null }: SeoOptions) {
  document.title = title

  upsertMeta('name', 'description', description)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:type', type)
  upsertMeta('property', 'og:site_name', 'SR Lux')

  const url = SITE_URL + (path ?? window.location.pathname)
  upsertMeta('property', 'og:url', url)

  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', url)

  if (image) {
    const absImage = image.startsWith('http') ? image : SITE_URL + image
    upsertMeta('property', 'og:image', absImage)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
  } else {
    upsertMeta('name', 'twitter:card', 'summary')
  }

  let ld = document.getElementById(SEO_JSONLD_ID) as HTMLScriptElement | null
  if (jsonLd) {
    if (!ld) {
      ld = document.createElement('script')
      ld.id = SEO_JSONLD_ID
      ld.type = 'application/ld+json'
      document.head.appendChild(ld)
    }
    ld.textContent = JSON.stringify(jsonLd)
  } else if (ld) {
    ld.remove()
  }
}

export function absoluteUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined
  return pathOrUrl.startsWith('http') ? pathOrUrl : SITE_URL + pathOrUrl
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SR Lux',
    url: SITE_URL,
    logo: `${SITE_URL}/public_assets/logo-horizontal.png`,
    description: 'Официальный дистрибьютор систем отопления и климат-контроля в Узбекистане.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'ул. Уста Ширин 111D',
      addressLocality: 'Ташкент',
      addressCountry: 'UZ',
    },
    telephone: '+998951854797',
  }
}
