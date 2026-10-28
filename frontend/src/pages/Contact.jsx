import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Phone,
  Smartphone,
} from "lucide-react";
import { assets } from "../assets/assets";
import "../components/StorefrontFoundation.css";
import "./Contact.css";

const campusUrl = "https://www.sti.edu/campuses/carmona";
// View Map destination published on the official STI College Carmona page.
const campusMapUrl = "https://maps.app.goo.gl/jGUbPypfedHoWMun7";
const supportItems = [
  {
    title: "Order Support",
    description:
      "Check pending orders, payments, cancellations, and fulfillment progress.",
    tablet: "See your existing orders and track progress.",
    mobile: "Track payments, status and claiming.",
    label: "View My Orders",
    to: "/orders",
  },
  {
    title: "General Inquiries",
    description:
      "Speak with STI College Carmona about school essentials and campus information.",
    tablet: "Call the campus for school information.",
    mobile: "Contact STI College Carmona directly.",
    label: "Call the campus",
    href: "tel:+63464301661",
  },
  {
    title: "Campus Concerns",
    description:
      "Find the campus location and official institutional information.",
    tablet: "Open the campus location for directions.",
    mobile: "Find your way to the campus.",
    label: "Get directions",
    href: campusMapUrl,
    external: true,
  },
];

const desktopCopyClassName = "hidden min-[1180px]:inline";
const tabletCopyClassName = "hidden md:inline min-[1180px]:hidden";
const mobileCopyClassName = "inline md:hidden";
const wideCopyClassName = "hidden md:inline";
const eyebrowClassName =
  "text-[11px] font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)]";
const descriptionClassName =
  "text-sm leading-[1.5] text-[color:var(--pamo-color-text-secondary)]";
const actionClassName = [
  "inline-flex min-h-11 w-full min-w-0 max-w-full items-center justify-center gap-2 rounded-[7px]",
  "border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 py-2.5",
  "text-center text-xs font-semibold leading-[1.5] text-[color:var(--pamo-color-text-primary)]",
  "hover:bg-[var(--pamo-color-surface-subtle)] md:text-[13px] min-[1180px]:min-h-12 min-[1180px]:text-sm",
].join(" ");
const supportLinkClassName =
  "mt-auto flex min-h-11 items-center gap-2 rounded-sm border-t border-[color:var(--pamo-color-border-default)] text-xs font-semibold leading-[1.5] hover:text-[color:var(--pamo-color-accent-text)]";
const detailClassName =
  "grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-[color:var(--pamo-color-border-default)] py-6 md:grid-cols-[minmax(0,1fr)_180px] md:items-center min-[1180px]:grid-cols-[48px_minmax(0,1fr)_176px] min-[1180px]:gap-5";
const detailIconClassName =
  "hidden h-12 w-12 items-center justify-center rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)] min-[1180px]:flex";
const detailCopyClassName =
  "[&_dt]:mb-3 [&_dt]:text-[11px] [&_dt]:font-medium [&_dt]:leading-[1.5] [&_dt]:text-[color:var(--pamo-color-text-secondary)] [&_dd]:text-sm [&_dd]:leading-[1.5] md:[&_dd]:text-base [&_dd_strong]:font-semibold [&_dd_span]:mt-1.5 [&_dd_span]:block [&_dd_span]:text-[color:var(--pamo-color-text-secondary)]";
const pageClassName = [
  "contact-page pt-8 text-[color:var(--pamo-color-text-primary)] min-[1180px]:pt-7",
  "[&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4",
  "[&_a:focus-visible]:outline-[color:var(--pamo-color-accent-text)]",
  "[&_[tabindex]:focus-visible]:outline [&_[tabindex]:focus-visible]:outline-2",
  "[&_[tabindex]:focus-visible]:outline-offset-4 [&_[tabindex]:focus-visible]:outline-[color:var(--pamo-color-accent-text)]",
  "[&_a]:[overflow-wrap:anywhere] [&_dd]:[overflow-wrap:anywhere] [&_dt]:[overflow-wrap:anywhere]",
  "[&_h1]:font-semibold [&_h1]:[overflow-wrap:anywhere] [&_h2]:font-semibold [&_h2]:[overflow-wrap:anywhere]",
  "[&_h3]:font-semibold [&_h3]:[overflow-wrap:anywhere] [&_p]:[overflow-wrap:anywhere] [&_svg]:shrink-0",
].join(" ");

const renderSupportAction = ({ label, to, href, external }) => {
  if (to) {
    return (
      <Link className={`${supportLinkClassName} text-[color:var(--pamo-color-accent-text)]`} to={to}>
        {label}{" "}
        <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <a
      className={supportLinkClassName}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {label}{" "}
      <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
      {external && (
        <span className="sr-only"> (Google Maps, opens in a new tab)</span>
      )}
    </a>
  );
};

const Contact = () => (
  <div className={pageClassName}>
    <div className="mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)] md:w-[calc(100%-60px)] min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]">
      <header>
        <p className={eyebrowClassName}>WE'RE HERE TO HELP</p>
        <h1 className="mt-5 text-[clamp(30px,8.72vw,34px)] leading-[1.2] md:text-[38px] min-[1180px]:text-[clamp(44px,3.264vw,47px)]">
          CONTACT <span className="text-[color:var(--pamo-color-accent-text)]">US</span>
        </h1>
        <p className={`${descriptionClassName} mt-4 min-[1180px]:text-base`}>
          <span className={desktopCopyClassName}>
            Questions about uniforms, orders, or campus services?
          </span>
          <span className={tabletCopyClassName}>
            For school uniforms, orders, and campus inquiries.
          </span>
          <span className={mobileCopyClassName}>
            Questions about your order, school essentials, or campus?
          </span>
        </p>
      </header>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 md:mt-10 md:gap-6 min-[1180px]:grid-cols-[minmax(0,1.73fr)_minmax(0,1fr)] min-[1180px]:items-stretch">
        <section
          className="min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-4 py-5 md:p-6 min-[1180px]:p-7"
          aria-labelledby="contact-campus-heading"
        >
          <header className="border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-3.5">
            <p className={eyebrowClassName}>
              <span className={desktopCopyClassName}>
                VISIT OR GET IN TOUCH
              </span>
              <span className={tabletCopyClassName}>STI COLLEGE CARMONA</span>
              <span className={mobileCopyClassName}>STI COLLEGE CARMONA</span>
            </p>
            <h2 className="mt-3.5 font-display text-[22px] leading-[1.3] md:text-2xl min-[1180px]:text-[28px]" id="contact-campus-heading">
              <span className={desktopCopyClassName}>STI College Carmona</span>
              <span className={tabletCopyClassName}>
                Campus contact information
              </span>
              <span className={mobileCopyClassName}>Visit or get in touch</span>
            </h2>
            <p className={`${descriptionClassName} mt-4`}>
              <span className={desktopCopyClassName}>
                Use these campus contact details for inquiries. For an existing
                order, you can also check its status in PAMO.
              </span>
              <span className={tabletCopyClassName}>
                For existing orders, the My Orders page also shows progress and
                payment details.
              </span>
              <span className={mobileCopyClassName}>
                Published school contact information.
              </span>
            </p>
          </header>
          <dl className="mt-6">
            <div className={detailClassName}>
              <span className={detailIconClassName} aria-hidden="true">
                <MapPin size={24} strokeWidth={1.75} />
              </span>
              <div className={detailCopyClassName}>
                <dt>CAMPUS LOCATION</dt>
                <dd>
                  <strong>South Luzon Expressway, Maduya</strong>
                  <span>Carmona, 4116 Cavite</span>
                </dd>
              </div>
              <a
                className={actionClassName}
                href={campusMapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions{" "}
                <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">
                  {" "}
                  (Google Maps, opens in a new tab)
                </span>
              </a>
            </div>
            <div className={detailClassName}>
              <span className={detailIconClassName} aria-hidden="true">
                <Phone size={24} strokeWidth={1.75} />
              </span>
              <div className={`${detailCopyClassName} md:col-span-2 min-[1180px]:col-span-2 min-[1180px]:col-start-2 [&_dd]:grid [&_dd]:grid-cols-[minmax(0,1fr)_minmax(94px,.75fr)] [&_dd]:items-center [&_dd]:gap-3 max-[359px]:[&_dd]:grid-cols-[minmax(0,1fr)] max-[359px]:[&_dd]:gap-2 md:[&_dd]:grid-cols-[minmax(0,1fr)_180px] min-[1180px]:[&_dd]:grid-cols-[minmax(0,1fr)_176px] min-[1180px]:[&_dd]:gap-5 [&_dd+dd]:mt-3`}>
                <dt>LANDLINES</dt>
                <dd>
                  <strong>(046) 430-1661</strong>
                  <a
                    className={actionClassName}
                    href="tel:+63464301661"
                    aria-label="Call (046) 430-1661"
                  >
                    Call 1661{" "}
                    <ArrowUpRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </a>
                </dd>
                <dd>
                  <strong>(046) 430-1671</strong>
                  <a
                    className={actionClassName}
                    href="tel:+63464301671"
                    aria-label="Call (046) 430-1671"
                  >
                    Call 1671{" "}
                    <ArrowUpRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </a>
                </dd>
              </div>
            </div>
            <div className={detailClassName}>
              <span className={detailIconClassName} aria-hidden="true">
                <Smartphone size={24} strokeWidth={1.75} />
              </span>
              <div className={detailCopyClassName}>
                <dt>MOBILE</dt>
                <dd>
                  <strong>0918 680 4021</strong>
                </dd>
              </div>
              <a
                className={actionClassName}
                href="tel:+639186804021"
                aria-label="Call mobile 0918 680 4021"
              >
                Call mobile{" "}
                <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </a>
            </div>
          </dl>
          <p className="border-t border-[color:var(--pamo-color-border-default)] pt-5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded [&_a]:font-semibold [&_a]:text-[color:var(--pamo-color-accent-text)] hover:[&_a]:underline">
            These are STI College Carmona contact numbers. For help with an
            existing order, check <Link to="/orders">My Orders</Link> for its
            current status.
          </p>
        </section>

        <aside
          className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] gap-4 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 max-[359px]:grid-cols-[minmax(0,1fr)] md:grid-cols-[208px_minmax(0,1fr)] md:gap-6 min-[1180px]:flex min-[1180px]:flex-col min-[1180px]:gap-7 min-[1180px]:p-[18px]"
          aria-labelledby="contact-website-heading"
        >
          <figure className="min-w-0 self-start rounded-[7px] bg-[var(--pamo-color-surface-subtle)] max-[359px]:w-[100px] min-[1180px]:w-full">
            <img
              src={assets.contact_img}
              alt="STI logo on a yellow background"
              width="894"
              height="894"
              className="block aspect-square w-full rounded-[7px] object-contain md:aspect-[208/160] min-[1180px]:aspect-[428/231]"
            />
          </figure>
          <div className="min-w-0 min-[1180px]:px-1">
            <p className={`${eyebrowClassName} hidden min-[1180px]:block`}>OFFICIAL CAMPUS WEBSITE</p>
            <h2 className="font-display text-[17px] leading-[1.4] md:text-xl min-[1180px]:mt-[18px]" id="contact-website-heading">
              <span className={desktopCopyClassName}>
                Explore STI College Carmona
              </span>
              <span className={tabletCopyClassName}>
                Explore the official campus website
              </span>
              <span className={mobileCopyClassName}>School information</span>
            </h2>
            <p className={`${descriptionClassName} mt-3 text-xs md:text-sm`}>
              <span className={wideCopyClassName}>
                For information about programs, admissions, and general campus
                services.
              </span>
              <span className={mobileCopyClassName}>
                Programs, admissions and campus details.
              </span>
            </p>
            <a
              className={`${actionClassName} mt-4 md:w-auto md:min-w-[180px]`}
              href={campusUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore STI website{" "}
              <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <div className="mt-7 hidden border-t border-[color:var(--pamo-color-border-default)] pt-5 min-[1180px]:block">
              <h3 className="text-[13px]">For order-specific help</h3>
              <p className="mt-2 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded [&_a]:font-semibold [&_a]:text-[color:var(--pamo-color-accent-text)] hover:[&_a]:underline">
                Start with <Link to="/orders">My Orders</Link> for your latest
                status.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section
        className="mt-12 md:mt-16 min-[1180px]:mt-20"
        aria-labelledby="contact-support-heading"
      >
        <p className={eyebrowClassName}>GET HELP WITH</p>
        <h2 className="mt-5 font-display text-2xl leading-[1.3] min-[1180px]:text-[28px]" id="contact-support-heading">
          <span className={desktopCopyClassName}>
            Choose the right next step
          </span>
          <span className={tabletCopyClassName}>
            What do you need help with?
          </span>
          <span className={mobileCopyClassName}>Find your next step</span>
        </h2>
        <p className={`${descriptionClassName} mt-4 hidden min-[1180px]:block`}>
          Three direct paths to the information or assistance you need.
        </p>
        <ol className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-4 md:mt-8 md:grid-cols-3 md:gap-5 min-[1180px]:mt-12 min-[1180px]:gap-6">
          {supportItems.map(
            (
              { title, description, tablet, mobile, label, to, href, external },
              index,
            ) => (
              <li className="flex min-w-0 flex-col rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-4 pb-2 pt-5 md:px-[18px] md:pb-2.5 md:pt-6 min-[1180px]:px-6 min-[1180px]:pb-3 min-[1180px]:pt-7" key={title}>
                <span className="text-[11px] font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)] before:mb-3.5 before:block before:h-[3px] before:w-7 before:bg-[var(--pamo-color-brand-yellow)] before:content-['']" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-lg leading-[1.4] min-[1180px]:text-[21px]">{title}</h3>
                <p className="mb-5 mt-3 text-[13px] leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">
                  <span className={desktopCopyClassName}>{description}</span>
                  <span className={tabletCopyClassName}>{tablet}</span>
                  <span className={mobileCopyClassName}>{mobile}</span>
                </p>
                {renderSupportAction({ label, to, href, external })}
              </li>
            ),
          )}
        </ol>
      </section>
    </div>
  </div>
);

export default Contact;
