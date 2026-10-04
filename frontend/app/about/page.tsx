"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"
import { heroDisplay, inter } from "@/lib/fonts"

// Jobright-style landing rebuild (2026-07-15). Section order mirrors
// jobright.ai/ai-agent: hero → logo marquee → stats band → "always on"
// feature rows → pain wall → two ways to start → CTA banner → footer.
// Previous version archived at design-docs/post-launch/archive/about-page-jobright-v1.tsx

const TYPED_QUERIES = [
  "2BR · under $900/bed · near Grainger",
  "Studio · available now",
  "4BR · near the Quad",
  "Houses · August 2026",
]

/* ---------- animation helpers ---------- */

// Fade-up on first scroll into view. Skips motion (but never hides content)
// when the user prefers reduced motion.
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
    >
      {children}
    </div>
  )
}

// Types its text out letter by letter the first time it scrolls into view,
// then hides the caret. Reduced-motion users get the full text immediately.
function TypedHeading({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [started, setStarted] = useState(false)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.6 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    if (shown >= text.length) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setShown(text.length), 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => setShown(s => s + 1), 70)
    return () => window.clearTimeout(timer)
  }, [started, shown, text])

  return (
    <h2 ref={ref} className={`${heroDisplay.className} text-4xl font-normal uppercase text-ink-900 min-h-[1.25em] sm:text-5xl`}>
      {text.slice(0, shown)}
      {started && shown < text.length && (
        <span className="inline-block w-[3px] h-[0.9em] bg-forest-green align-middle ml-1" aria-hidden />
      )}
      <span className="sr-only">{text}</span>
    </h2>
  )
}

// Typewriter loop over example queries, shown inside the hero's mock search
// pill. Reduced-motion users get the first query as static text.
function TypedQuery() {
  const [text, setText] = useState("")

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setText(TYPED_QUERIES[0]), 0)
      return () => window.clearTimeout(timer)
    }
    let queryIdx = 0
    let charIdx = 0
    let deleting = false
    let timer: number

    const tick = () => {
      const q = TYPED_QUERIES[queryIdx]
      if (!deleting) {
        charIdx += 1
        setText(q.slice(0, charIdx))
        if (charIdx === q.length) {
          deleting = true
          timer = window.setTimeout(tick, 1700)
          return
        }
        timer = window.setTimeout(tick, 45)
      } else {
        charIdx -= 1
        setText(q.slice(0, charIdx))
        if (charIdx === 0) {
          deleting = false
          queryIdx = (queryIdx + 1) % TYPED_QUERIES.length
        }
        timer = window.setTimeout(tick, 22)
      }
    }
    timer = window.setTimeout(tick, 500)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      {text}
      <span className="inline-block w-0.5 h-[1.1em] bg-forest-green align-middle ml-0.5 animate-pulse motion-reduce:animate-none" />
    </>
  )
}

function GrowthMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 88 88"
      className="h-16 w-16 shrink-0 text-forest-green sm:h-20 sm:w-20 md:h-24 md:w-24"
    >
      <circle cx="44" cy="44" r="42" fill="currentColor" opacity="0.08" />
      <path
        d="M20 62H72"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
        opacity="0.22"
      />
      <rect x="23" y="47" width="9" height="15" rx="3" fill="currentColor" opacity="0.28" />
      <rect x="39" y="37" width="9" height="25" rx="3" fill="currentColor" opacity="0.46" />
      <rect x="55" y="25" width="9" height="37" rx="3" fill="currentColor" opacity="0.72" />
      <path
        d="M24 43C34 39 40 31 48 33C57 35 59 23 69 19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M61 18H70V27"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  )
}

/* ---------- CSS-only product mocks for the feature rows ---------- */

function MockSources() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(53,20,11,0.2)] p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-full border border-mist-100 bg-mist-50 px-4 py-2 text-sm text-ink-900/60">
        <span aria-hidden>🔍</span> near Grainger, under $900/bed
      </div>
      {COMPANIES.slice(0, 4).map(({ name, logo }) => (
        <div key={name} className="flex items-center justify-between rounded-xl border border-mist-100 px-4 py-2.5">
          <img src={logo} alt={name} className="h-4 object-contain object-left" />
          <span className="w-5 h-5 rounded-full bg-blush-pink text-forest-green flex items-center justify-center text-[11px] font-bold">✓</span>
        </div>
      ))}
      <span className="self-center text-[11px] font-bold uppercase tracking-widest text-neutral-400">
        + {Math.max(COMPANIES.length - 4, 0)} more, one result list
      </span>
    </div>
  )
}

function MockListingCard() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(53,20,11,0.2)] overflow-hidden max-w-sm mx-auto">
      <div className="relative h-28 bg-[linear-gradient(266deg,#F6E0DA,#FFFDEE)]">
        <span className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-forest-green text-warm-ivory">
          Available Now
        </span>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div className="font-bold text-ink-900 text-sm">308 E Green St, Champaign</div>
        <div className="flex gap-1.5">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-forest-green/10 text-forest-green">2 Bed</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-blush-pink text-ink-900">Apartment</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xl font-bold text-ink-900 tracking-tight">
              $785<span className="text-sm text-neutral-400 font-medium">/bed</span>
            </div>
            <div className="text-xs text-neutral-400">$1,570 total, not a teaser price</div>
          </div>
          <span className="text-xs font-bold text-warm-ivory bg-forest-green px-3 py-1.5 rounded-full">View →</span>
        </div>
      </div>
    </div>
  )
}

function MockMapSearch() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(53,20,11,0.2)] p-5">
      <div className="flex flex-wrap gap-2 mb-4">
        {["2 Bed", "< $900/bed", "Available August", "Apartment"].map(label => (
          <span key={label} className="px-3 py-1.5 rounded-full bg-mist-50 border border-mist-100 text-xs font-bold text-ink-900">
            {label}
          </span>
        ))}
      </div>
      <div className="relative h-48 rounded-2xl overflow-hidden bg-[linear-gradient(135deg,#FFFDEE,#F6E0DA)] border border-mist-100">
        <div className="absolute inset-0 opacity-60 bg-[linear-gradient(90deg,transparent_23px,#ffffff_24px),linear-gradient(0deg,transparent_23px,#ffffff_24px)] bg-[length:48px_48px]" />
        {[
          ["left-[18%] top-[30%]", "$785"],
          ["left-[55%] top-[22%]", "$860"],
          ["left-[68%] top-[62%]", "$895"],
          ["left-[34%] top-[68%]", "$820"],
        ].map(([pos, price]) => (
          <span
            key={price}
            className={`absolute ${pos} -translate-x-1/2 -translate-y-1/2 rounded-full bg-forest-green text-warm-ivory text-xs font-bold px-3 py-1.5 shadow-lg`}
          >
            {price}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AboutPage() {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const statBlocks = [
    { value: status?.listing_count?.toLocaleString() ?? "…", labelTop: "Floor Plans", labelBottom: "Tracked" },
    { value: status?.property_count?.toLocaleString() ?? "…", labelTop: "Properties", labelBottom: "Across Town" },
    { value: String(COMPANIES.length), labelTop: "Companies", labelBottom: "One Search" },
    { value: "100%", labelTop: "Free For", labelBottom: "UIUC Students" },
  ]

  const features: { title: string; body: string; cta: { label: string; href: string }; mock: React.ReactNode }[] = [
    {
      title: "One Search, Every Company",
      body: "Green Street Realty, Universities Group, Smile and every other tracked source, answered together in one list instead of twelve tabs.",
      cta: { label: "Browse Every Company", href: "/card" },
      mock: <MockSources />,
    },
    {
      title: "The Real Price Per Bed",
      body: "A starting-at price is usually the cheapest unit type, which can cost twice as much per bed as the one you want. Every result here is normalized to the exact unit, so comparisons stay honest.",
      cta: { label: "Compare Real Prices", href: "/card" },
      mock: <MockListingCard />,
    },
    {
      title: "Filter Once, See It Everywhere",
      body: "Choose beds, budget, move-in window, company, and property type once. The same filtered dataset powers the card grid and full-screen map.",
      cta: { label: "Open the Map", href: "/map" },
      mock: <MockMapSearch />,
    },
  ]

  return (
    <div className={`${inter.className} min-h-screen bg-warm-ivory text-ink-900`}>
      <style>{`
        @keyframes about-logo-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(calc(-50% - 0.75rem));
          }
        }

        .about-logo-track {
          animation: about-logo-marquee 28s linear infinite;
        }

        .about-logo-belt:hover .about-logo-track {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .about-logo-track {
            animation: none;
            flex-wrap: wrap;
            width: 100%;
            justify-content: center;
          }

          .about-logo-duplicate {
            display: none;
          }
        }
      `}</style>
      <div className="sticky top-0 z-30 bg-transparent">
        <AppHeader />
      </div>

      {/* Hero */}
      <section className="-mt-16 overflow-hidden bg-[#E0CCB2] px-6 pb-20 pt-36 text-black md:pb-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(620px,1.14fr)_minmax(340px,0.86fr)] lg:gap-8">
          <div className="text-center lg:text-left">
            <Reveal>
              <h1 className="mx-auto flex max-w-4xl flex-col text-black lg:mx-0">
                <span className={`${heroDisplay.className} self-start text-[clamp(3.25rem,8vw,7.5rem)] font-normal uppercase leading-[0.88]`}>
                  Find
                </span>
                <span className={`${heroDisplay.className} -mt-1 self-end whitespace-nowrap rounded-3xl bg-blush-pink px-4 py-2 text-[clamp(2rem,3.5vw,3.8rem)] font-normal uppercase leading-[0.9] text-black sm:-mt-4 sm:px-6 lg:self-start lg:ml-16`}>
                  your UIUC place
                </span>
                <span className="mt-4 flex items-baseline justify-end gap-3 sm:mt-5 sm:gap-5 lg:justify-center">
                  <span className="font-serif text-[clamp(1.9rem,4.2vw,4.25rem)] italic leading-none text-forest-green">
                    in
                  </span>
                  <span className={`${heroDisplay.className} text-[clamp(2.25rem,5.3vw,5.25rem)] font-normal uppercase leading-[0.92]`}>
                    one page
                  </span>
                </span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex items-center gap-2.5 max-w-md mx-auto mt-9 rounded-full border border-ink-900/8 bg-warm-ivory px-5 py-3 text-sm text-ink-900/65 shadow-[0_18px_42px_-18px_rgba(53,20,11,0.35)] text-left lg:mx-0">
                <span aria-hidden>🔍</span>
                <span className="truncate"><TypedQuery /></span>
              </div>
              <p className="text-ink-900/72 text-base sm:text-lg max-w-xl mx-auto mt-6 leading-relaxed lg:mx-0">
                One searchable dataset across UIUC-area leasing companies, with honest price per bed,
                live availability, and map-first comparison.
              </p>
              <div className="flex items-center justify-center gap-3 mt-8">
                <Link
                  href="/card"
                  className="px-6 py-3 rounded-full bg-blush-pink text-espresso-brown text-sm font-bold hover:bg-warm-ivory transition-colors"
                >
                  Search listings
                </Link>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-forest-green text-warm-ivory text-sm font-bold shadow-[0_10px_24px_-16px_rgba(34,78,48,0.8)] hover:bg-ink-900 transition-colors"
                >
                  Browse the map →
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={180} className="hidden lg:block">
            <div className="relative min-h-[560px]">
              <img
                src="/about/uiuc-housing-hero.png"
                alt="Illustrated UIUC student housing scene"
                className="absolute right-[-1%] top-1/2 w-[min(34vw,500px)] -translate-y-1/2 drop-shadow-[0_28px_38px_rgba(53,20,11,0.18)]"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats + coverage panel */}
      <section className="bg-warm-ivory px-6 py-20 md:py-24">
        <Reveal>
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 flex flex-col items-center justify-center gap-4 text-center sm:flex-row sm:gap-8 sm:text-left">
              <div className="flex items-center justify-center gap-4 sm:gap-5">
                <GrowthMark />
                <div className={`${heroDisplay.className} text-[96px] font-normal leading-none text-ink-900 sm:text-[128px] md:text-[150px]`}>
                  500+
                </div>
              </div>
              <p className="max-w-md text-2xl font-medium leading-snug text-ink-900 sm:text-3xl">
                UIUC students have already found housing with us.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-4 sm:gap-8 xl:gap-6">
              {statBlocks.map(({ value, labelTop, labelBottom }) => (
                <div key={`${labelTop}-${labelBottom}`} className="flex items-center justify-center gap-5 sm:justify-start lg:gap-6 xl:gap-5">
                  <div className={`${heroDisplay.className} text-[64px] font-normal leading-none text-ink-900 md:text-[72px] xl:text-[70px]`}>
                    {value}
                  </div>
                  <div className="whitespace-nowrap text-xl font-medium leading-[1.55] text-ink-900 md:text-2xl xl:text-xl">
                    <div>{labelTop}</div>
                    <div>{labelBottom}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="about-logo-belt -mx-3 mt-12 overflow-hidden py-4 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
              <div className="about-logo-track flex w-max items-center gap-6 pr-6">
                <span className="shrink-0 whitespace-nowrap px-3 font-serif text-2xl italic leading-none text-forest-green md:text-3xl">
                  One Search Across
                </span>
                {COMPANIES.map(({ name, logo }) => (
                  <div key={name} className="flex h-12 w-[148px] shrink-0 items-center justify-center rounded-full bg-warm-ivory/80 px-5">
                    <img src={logo} alt={name} className="h-5 max-w-[108px] w-auto object-contain" />
                  </div>
                ))}
                <span aria-hidden className="about-logo-duplicate shrink-0 whitespace-nowrap px-3 font-serif text-2xl italic leading-none text-forest-green md:text-3xl">
                  One Search Across
                </span>
                {COMPANIES.map(({ name, logo }) => (
                  <div
                    key={`${name}-duplicate`}
                    aria-hidden
                    className="about-logo-duplicate flex h-12 w-[148px] shrink-0 items-center justify-center rounded-full bg-warm-ivory/80 px-5"
                  >
                    <img src={logo} alt="" className="h-5 max-w-[108px] w-auto object-contain" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Feature rows */}
      <section className="bg-forest-green px-6 py-24 text-warm-ivory md:py-28">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-20">
            {features.map(({ title, body, cta, mock }, i) => (
              <Reveal key={title}>
                <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-center">
                  <div className={i % 2 === 1 ? "md:order-2" : ""}>
                    <h3 className={`${heroDisplay.className} text-4xl font-normal uppercase leading-[0.95] text-warm-ivory mb-4 sm:text-5xl`}>{title}</h3>
                    <p className="text-base text-warm-ivory/78 font-medium leading-relaxed mb-8">{body}</p>
                    <Link
                      href={cta.href}
                      className="inline-flex items-center gap-3 rounded-[28px] bg-blush-pink text-espresso-brown px-6 py-3.5 text-base font-semibold hover:bg-warm-ivory transition-colors"
                    >
                      {cta.label}
                      <span className="w-6 h-6 rounded-full bg-espresso-brown text-warm-ivory flex items-center justify-center text-sm leading-none" aria-hidden>
                        ›
                      </span>
                    </Link>
                  </div>
                  <div className={i % 2 === 1 ? "md:order-1" : ""}>{mock}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Two ways to start — full-bleed grey band (Apple-style, contrasts with
          the white features above and the gradient CTA below), white
          question-cards with tag chips, typewriter title */}
      <section className="px-6 py-24 bg-warm-ivory">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <TypedHeading text="Two Ways to Start" />
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <Reveal>
              <div className="p-8 bg-white rounded-3xl border border-mist-100 hover:border-forest-green hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(53,20,11,0.22)] transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 h-full flex flex-col">
                <div className="w-11 h-11 flex items-center justify-center text-xl mb-4 rounded-xl bg-mist-50 border border-mist-100">🎯</div>
                <div className={`${heroDisplay.className} text-2xl font-normal uppercase leading-none text-ink-900 mb-2`}>Browse and filter with cards</div>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Use the card view to scan matching listings visually, adjust your filters, and
                  compare the details that matter before opening a landlord page.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {["Beds", "Budget", "Move-in date", "Company"].map(tag => (
                    <span key={tag} className="px-2 py-1 rounded-md bg-blush-pink text-[13px] font-medium text-ink-900">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-auto pt-6">
                  <Link href="/card" className="px-5 py-2.5 rounded-full bg-forest-green text-warm-ivory text-sm font-bold hover:bg-ink-900 transition-colors">
                    Open Card View
                  </Link>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="p-8 bg-white rounded-3xl border border-mist-100 hover:border-forest-green hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(53,20,11,0.22)] transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 h-full flex flex-col">
                <div className="w-11 h-11 flex items-center justify-center text-xl mb-4 rounded-xl bg-mist-50 border border-mist-100">⌖</div>
                <div className={`${heroDisplay.className} text-2xl font-normal uppercase leading-none text-ink-900 mb-2`}>Need to compare by location?</div>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Use the map when distance matters more than a spreadsheet view. See prices
                  around campus, then open the listing detail from the pin or card.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {["Campus context", "Price pins", "Listing details"].map(tag => (
                    <span key={tag} className="px-2 py-1 rounded-md bg-blush-pink text-[13px] font-medium text-ink-900">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-auto pt-6">
                  <Link href="/map" className="px-5 py-2.5 rounded-full bg-forest-green text-warm-ivory text-sm font-bold hover:bg-ink-900 transition-colors">
                    Open the Map
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-blush-pink px-6 py-24">
        <Reveal>
          <div className="max-w-5xl mx-auto px-8 py-10 text-center">
            <h2 className={`${heroDisplay.className} text-4xl font-normal uppercase leading-none text-ink-900 sm:text-5xl`}>Ready to find your place?</h2>
            <p className="text-sm text-ink-900/70 font-medium mt-3">
              Every UIUC-area leasing company, one search.
            </p>
            <Link
              href="/card"
              className="inline-block px-7 py-3 rounded-full bg-forest-green text-warm-ivory text-sm font-bold hover:bg-ink-900 transition-colors mt-8"
            >
              Get started
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="bg-warm-ivory px-6 py-16 md:py-24" aria-hidden>
        <div className="mx-auto h-px max-w-5xl bg-espresso-brown/10" />
      </section>

      {/* Footer — jobright's multi-column layout: bold wordmark row on top,
          then bold column headers with link lists. Coverage is informational
          (no product pages per company yet), so those entries are plain text. */}
      <footer className="bg-[#E0CCB2] px-6 pt-16 pb-14 text-ink-900">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-12">
            <div className={`${heroDisplay.className} text-3xl font-normal uppercase leading-none text-ink-900`}>UIUC Housing</div>
            <div className="text-sm text-ink-900/45">Built for UIUC students in Champaign-Urbana.</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-12">
            <div>
              <div className="font-bold text-ink-900 mb-4">Features</div>
              <ul className="space-y-2.5 text-[15px]">
                {([
                  ["Card View", "/card"],
                  ["Map View", "/map"],
                ] as const).map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-900/70 hover:text-forest-green transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="font-bold text-ink-900 mb-4">Coverage</div>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[15px] text-ink-900/55">
                {COMPANIES.map(({ name }) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
            <div className="md:justify-self-end">
              <div className="font-bold text-ink-900 mb-4">Information</div>
              <ul className="space-y-2.5 text-[15px]">
                {([
                  ["About Us", "/about"],
                  ["Join the Waitlist", "/coming-soon"],
                  ["Log In", "/login"],
                ] as const).map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-900/70 hover:text-forest-green transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
