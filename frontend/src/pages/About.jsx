import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { assets } from "../assets/assets";
import "../components/StorefrontFoundation.css";
import "./About.css";

const values = [
  ["Students First", "A clearer way to order."],
  ["Organized Records", "Products, sizes, and orders."],
  ["Visible Progress", "Follow the next step."],
];

// Presentation only: the existing product, checkout and order pages own these steps.
const steps = [
  ["Browse products", "Explore the collection.", "Find your essentials."],
  ["Choose your size", "Check per-size stock.", "Check size availability."],
  ["Place an order", "Choose a payment method.", "Select a payment method."],
  [
    "Track and claim",
    "Monitor your order status.",
    "Follow your order status.",
  ],
];

const benefits = [
  [
    "Product clarity",
    "Clear Product Information",
    "See merchandise details, sizes and stock before ordering.",
    "Check available sizes and product details.",
  ],
  [
    "Ordering",
    "Fewer Steps to Order",
    "Find essentials, add them to your cart and place an order.",
    "Shop and place your order in one place.",
  ],
  [
    "Visibility",
    "Know Your Order Status",
    "Check the latest order status and next steps in one place.",
    "Follow order updates and next steps.",
  ],
];

const eyebrowClassName =
  "text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]";
const desktopCopyClassName = "hidden min-[1180px]:inline";
const tabletCopyClassName = "hidden md:inline min-[1180px]:hidden";
const mobileCopyClassName = "inline md:hidden";
const wideCopyClassName = "hidden md:inline";
const nonTabletCopyClassName = "inline md:hidden min-[1180px]:inline";

const pageClassName = [
  "about-page pt-6 text-[color:var(--pamo-color-text-primary)] md:pt-4 min-[1180px]:pt-5",
  "[&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4",
  "[&_a:focus-visible]:outline-[color:var(--pamo-color-accent-text)]",
  "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
  "[&_h1]:text-[color:var(--pamo-color-text-primary)] [&_h2]:text-[color:var(--pamo-color-text-primary)] [&_h3]:text-[color:var(--pamo-color-text-primary)]",
  "[&_a]:[overflow-wrap:anywhere] [&_dd]:[overflow-wrap:anywhere] [&_dt]:[overflow-wrap:anywhere]",
  "[&_h1]:[overflow-wrap:anywhere] [&_h2]:[overflow-wrap:anywhere] [&_h3]:[overflow-wrap:anywhere] [&_p]:[overflow-wrap:anywhere]",
].join(" ");

const About = () => (
  <div className={pageClassName}>
    <div className="mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)] md:w-[calc(100%-60px)] min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]">
      <section className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.03fr)_minmax(0,1fr)] md:gap-x-7 min-[1180px]:grid-cols-[minmax(0,1.09fr)_minmax(0,1fr)] min-[1180px]:gap-x-[clamp(48px,7.4vw,104px)] min-[1180px]:gap-y-6" aria-labelledby="about-heading">
        <nav className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-text-secondary)] md:col-span-2 md:mb-3.5 min-[1180px]:col-span-1 min-[1180px]:col-start-1 min-[1180px]:row-start-1 min-[1180px]:mb-0 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded hover:[&_a]:text-[color:var(--pamo-color-accent-text)]" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">About Us</span>
        </nav>
        <div className="mt-5 min-w-0 md:mt-12 min-[1180px]:col-start-1 min-[1180px]:row-start-2 min-[1180px]:m-0">
          <div className="border-l-4 border-[color:var(--pamo-color-brand-yellow)] pb-1 pl-3.5 md:pl-4 min-[1180px]:pl-5">
            <p className={eyebrowClassName}>School essentials, simplified</p>
            <h1 className="mt-5 text-[clamp(30px,8.72vw,34px)] leading-[1.2] tracking-[-.015em] md:mt-6 md:text-[38px] min-[1180px]:mt-[30px] min-[1180px]:text-[clamp(46px,3.82vw,55px)]" id="about-heading">
              ABOUT <span className="text-[color:var(--pamo-color-accent-text)]">US</span>
            </h1>
          </div>
          <p className="mt-8 max-w-[40ch] text-[19px] font-semibold leading-[1.5] md:mt-[26px] md:text-[22px] min-[1180px]:mt-[34px] min-[1180px]:text-[26px]">
            A simpler way to manage school essentials.
          </p>
          <p className="mt-3.5 max-w-[60ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:mt-[22px] md:text-[15px] min-[1180px]:mt-4 min-[1180px]:text-[17px]">
            <span className={desktopCopyClassName}>
              PAMO / SmartStock connects students and school staff through one
              organized uniform-ordering platform. Browse essentials, place
              orders, and follow their progress in one place.
            </span>
            <span className={tabletCopyClassName}>
              PAMO / SmartStock connects students and school staff through one
              organized uniform-ordering platform.
            </span>
            <span className={mobileCopyClassName}>
              PAMO / SmartStock connects students and staff through one
              organized uniform-ordering platform. Browse essentials, place
              orders, and follow their progress.
            </span>
          </p>
          <div className="mt-8 flex flex-wrap gap-3 md:mt-12 [&_a]:min-w-0 [&_a]:px-3 max-[359px]:[&_a]:basis-full min-[1180px]:[&_a]:min-h-[50px] min-[1180px]:[&_a]:flex-none min-[1180px]:[&_a]:text-sm">
            <Link to="/collection" className="home-brand-action flex-[1.6] min-[1180px]:min-w-[233px]">
              Explore Collection{" "}
              <ArrowRight
                className="storefront-action-icon"
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
            <Link to="/contact" className="home-outline-action flex-1 min-[1180px]:min-w-[165px]">
              Contact Us
            </Link>
          </div>
        </div>
        <figure className="mt-8 min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-2.5 md:m-0 md:self-start md:rounded-[10px] md:p-3 min-[1180px]:col-start-2 min-[1180px]:row-span-3 min-[1180px]:row-start-1 min-[1180px]:mt-5 min-[1180px]:rounded-xl min-[1180px]:p-[17px]">
          <div className="relative aspect-[330/318] overflow-hidden rounded-md bg-[var(--pamo-color-surface-subtle)] after:absolute after:inset-y-0 after:left-0 after:w-1.5 after:bg-[var(--pamo-color-brand-yellow)] after:content-[''] md:aspect-[335/486] md:rounded-[7px] min-[1180px]:aspect-[522/541] min-[1180px]:rounded-lg min-[1180px]:after:w-2">
            <img
              src={assets.about_img}
              alt="STI College Carmona students in school uniforms with sports, music, and campus activity essentials"
              width="728"
              height="1098"
              decoding="async"
              className="absolute inset-0 block h-full w-full object-cover object-[center_75%]"
            />
          </div>
        </figure>
        <section className="mt-12 min-w-0 md:col-span-2 md:mt-9 min-[1180px]:col-span-1 min-[1180px]:col-start-1 min-[1180px]:row-start-3 min-[1180px]:mt-7" aria-label="Core values">
          <p className={`${eyebrowClassName} mb-[18px] md:hidden`}>What we value</p>
          <dl className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-3 md:gap-6 md:border-t md:border-[color:var(--pamo-color-border-default)] md:pt-7 min-[1180px]:gap-3.5">
            {values.map(([title, description]) => (
              <div className="min-w-0 border-t border-[color:var(--pamo-color-border-default)] py-4 md:border-0 md:pb-3 md:pt-0 md:[&+div]:border-l md:[&+div]:border-[color:var(--pamo-color-border-default)] md:[&+div]:pl-5 min-[1180px]:[&+div]:pl-3.5" key={title}>
                <dt className="text-sm font-semibold leading-[1.5]">{title}</dt>
                <dd className="mt-1.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>

      <section
        className="mt-14 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-4 pb-6 pt-[18px] md:mt-16 md:px-[22px] md:pb-9 md:pt-6 min-[1180px]:mt-[76px] min-[1180px]:grid min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)] min-[1180px]:gap-12 min-[1180px]:rounded-[10px] min-[1180px]:p-10 min-[1180px]:px-12"
        aria-labelledby="about-ordering-heading"
      >
        <div>
          <header className="border-l-[3px] border-[color:var(--pamo-color-brand-yellow)] pl-3 md:pl-4">
            <p className={eyebrowClassName}>
              <span className={nonTabletCopyClassName}>The student journey</span>
              <span className={tabletCopyClassName}>How PAMO works</span>
            </p>
            <h2 className="mt-4 font-display text-[22px] leading-[1.4] tracking-[-.015em] max-[359px]:text-[21px] md:mt-[22px] md:text-[27px]" id="about-ordering-heading">
              <span className={nonTabletCopyClassName}>How ordering works</span>
              <span className={tabletCopyClassName}>
                From shopping to claiming
              </span>
            </h2>
          </header>
          <p className="mt-6 hidden text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:block min-[1180px]:mt-[30px] min-[1180px]:max-w-[60ch]">
            <span className={desktopCopyClassName}>
              PAMO keeps the key steps together, so you can focus on getting the
              right essentials for campus.
            </span>
            <span className={tabletCopyClassName}>
              Students see the steps; staff coordinate inventory and fulfillment
              behind the scenes.
            </span>
          </p>
          <p className="mt-16 hidden max-w-[60ch] text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:block">
            Behind the scenes, PAMO staff manage products, stock and order
            coordination.
          </p>
        </div>
        <ol className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 md:mt-8 md:grid-cols-2 md:gap-4 min-[1180px]:m-0 min-[1180px]:gap-x-[30px] min-[1180px]:gap-y-[22px]">
          {steps.map(([title, description, mobileDescription], index) => (
            <li className="flex min-h-[78px] min-w-0 items-start gap-5 rounded-md bg-[var(--pamo-color-surface-subtle)] px-3 py-3.5 md:relative md:min-h-[102px] md:rounded-[7px] md:px-3.5 md:pb-[18px] md:pt-[30px] md:before:absolute md:before:left-3.5 md:before:top-4 md:before:h-[3px] md:before:w-6 md:before:bg-[var(--pamo-color-brand-yellow)] md:before:content-[''] min-[1180px]:min-h-[157px] min-[1180px]:flex-col min-[1180px]:gap-5 min-[1180px]:rounded-lg min-[1180px]:px-5 min-[1180px]:pb-5 min-[1180px]:pt-[34px] min-[1180px]:before:left-4 min-[1180px]:before:top-[18px] min-[1180px]:before:w-[34px]" key={title}>
              <span className="shrink-0 text-xs font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)]" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-sm leading-[1.5] md:text-[15px] min-[1180px]:text-[17px]">{title}</h3>
                <p className="mt-2 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:mt-3">
                  <span className={wideCopyClassName}>{description}</span>
                  <span className={mobileCopyClassName}>{mobileDescription}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="mt-[70px] grid grid-cols-[minmax(0,1fr)] gap-6 border-y border-[color:var(--pamo-color-border-default)] py-9 pb-10 md:mt-[66px] md:grid-cols-[minmax(0,.52fr)_minmax(0,1fr)] md:gap-9 md:pb-12 md:pt-10 min-[1180px]:mt-[82px] min-[1180px]:grid-cols-[minmax(0,.47fr)_minmax(0,1fr)] min-[1180px]:gap-14 min-[1180px]:pb-[60px] min-[1180px]:pt-[50px]"
        aria-labelledby="about-mission-heading"
      >
        <h2 className="self-start border-l-4 border-[color:var(--pamo-color-brand-yellow)] py-2 pl-3.5 font-display text-[21px] leading-[1.5] md:pl-5 md:text-[22px] min-[1180px]:py-0 min-[1180px]:text-[28px]" id="about-mission-heading">
          OUR <span className="min-[1180px]:block min-[1180px]:text-[color:var(--pamo-color-accent-text)]">MISSION</span>
        </h2>
        <p className="max-w-[75ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:text-[15px] min-[1180px]:text-lg">
          Our mission is to make school uniform ordering more organized and
          transparent. By connecting browsing, size and stock information, order
          placement, payment options and order tracking, we aim to make the
          process easier for students and school staff.
        </p>
      </section>

      <section
        className="mt-16"
        aria-labelledby="about-benefits-heading"
      >
        <p className={eyebrowClassName}>Why PAMO?</p>
        <h2 className="mt-5 font-display text-2xl leading-[1.4] tracking-[-.015em] md:text-[28px] min-[1180px]:mt-6 min-[1180px]:text-[32px]" id="about-benefits-heading">Built around practical needs</h2>
        <p className="mt-4 hidden text-[15px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:block">
          Three specific ways the platform supports the campus experience.
        </p>
        <ul className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3 md:gap-[22px] min-[1180px]:mt-10 min-[1180px]:gap-[26px]">
          {benefits.map(
            ([label, title, description, mobileDescription], index) => (
              <li className="relative min-h-[147px] min-w-0 rounded-[7px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-4 pb-5 pt-[30px] before:absolute before:left-4 before:top-4 before:h-[3px] before:w-[25px] before:bg-[var(--pamo-color-brand-yellow)] before:content-[''] md:min-h-[214px] md:rounded-lg md:pb-6 md:pt-[42px] md:before:top-5 md:before:w-[26px] min-[1180px]:min-h-[211px] min-[1180px]:rounded-[9px] min-[1180px]:px-[22px] min-[1180px]:pt-11 min-[1180px]:before:left-[22px] min-[1180px]:before:top-[22px] min-[1180px]:before:w-8" key={title}>
                <p className={`${eyebrowClassName}`}>
                  {String(index + 1).padStart(2, "0")} / {label}
                </p>
                <h3 className="mt-5 text-[17px] leading-[1.5] min-[1180px]:text-[19px]">{title}</h3>
                <p className="mt-3 max-w-[55ch] text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:mt-6 md:text-[13px] min-[1180px]:mt-[18px]">
                  <span className={wideCopyClassName}>{description}</span>
                  <span className={mobileCopyClassName}>{mobileDescription}</span>
                </p>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  </div>
);

export default About;
