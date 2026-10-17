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

const Contact = () => (
  <div className="contact-page">
    <div className="contact-container">
      <header className="contact-editorial">
        <p className="contact-eyebrow">WE'RE HERE TO HELP</p>
        <h1>
          CONTACT <span>US</span>
        </h1>
        <p className="contact-description">
          <span className="contact-copy-desktop">
            Questions about uniforms, orders, or campus services?
          </span>
          <span className="contact-copy-tablet">
            For school uniforms, orders, and campus inquiries.
          </span>
          <span className="contact-copy-mobile">
            Questions about your order, school essentials, or campus?
          </span>
        </p>
      </header>

      <div className="contact-campus">
        <section
          className="contact-card"
          aria-labelledby="contact-campus-heading"
        >
          <header className="contact-card-intro">
            <p className="contact-eyebrow">
              <span className="contact-copy-desktop">
                VISIT OR GET IN TOUCH
              </span>
              <span className="contact-copy-tablet">STI COLLEGE CARMONA</span>
              <span className="contact-copy-mobile">STI COLLEGE CARMONA</span>
            </p>
            <h2 id="contact-campus-heading">
              <span className="contact-copy-desktop">STI College Carmona</span>
              <span className="contact-copy-tablet">
                Campus contact information
              </span>
              <span className="contact-copy-mobile">Visit or get in touch</span>
            </h2>
            <p className="contact-description">
              <span className="contact-copy-desktop">
                Use these campus contact details for inquiries. For an existing
                order, you can also check its status in PAMO.
              </span>
              <span className="contact-copy-tablet">
                For existing orders, the My Orders page also shows progress and
                payment details.
              </span>
              <span className="contact-copy-mobile">
                Published school contact information.
              </span>
            </p>
          </header>
          <dl className="contact-details">
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">
                <MapPin size={24} strokeWidth={1.75} />
              </span>
              <div className="contact-detail-copy">
                <dt>CAMPUS LOCATION</dt>
                <dd>
                  <strong>South Luzon Expressway, Maduya</strong>
                  <span>Carmona, 4116 Cavite</span>
                </dd>
              </div>
              <a
                className="contact-action btn-secondary"
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
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">
                <Phone size={24} strokeWidth={1.75} />
              </span>
              <div className="contact-landlines">
                <dt>LANDLINES</dt>
                <dd>
                  <strong>(046) 430-1661</strong>
                  <a
                    className="contact-action btn-secondary"
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
                    className="contact-action btn-secondary"
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
            <div className="contact-detail">
              <span className="contact-icon" aria-hidden="true">
                <Smartphone size={24} strokeWidth={1.75} />
              </span>
              <div className="contact-detail-copy">
                <dt>MOBILE</dt>
                <dd>
                  <strong>0918 680 4021</strong>
                </dd>
              </div>
              <a
                className="contact-action contact-action-primary btn-primary"
                href="tel:+639186804021"
                aria-label="Call mobile 0918 680 4021"
              >
                Call mobile{" "}
                <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </a>
            </div>
          </dl>
          <p className="contact-note">
            These are STI College Carmona contact numbers. For help with an
            existing order, check <Link to="/orders">My Orders</Link> for its
            current status.
          </p>
        </section>

        <aside
          className="contact-campus-panel"
          aria-labelledby="contact-website-heading"
        >
          <figure className="contact-visual">
            <img
              src={assets.contact_img}
              alt="STI logo on a yellow background"
              width="894"
              height="894"
            />
          </figure>
          <div className="contact-campus-copy">
            <p className="contact-eyebrow">OFFICIAL CAMPUS WEBSITE</p>
            <h2 id="contact-website-heading">
              <span className="contact-copy-desktop">
                Explore STI College Carmona
              </span>
              <span className="contact-copy-tablet">
                Explore the official campus website
              </span>
              <span className="contact-copy-mobile">School information</span>
            </h2>
            <p className="contact-description">
              <span className="contact-copy-wide">
                For information about programs, admissions, and general campus
                services.
              </span>
              <span className="contact-copy-mobile">
                Programs, admissions and campus details.
              </span>
            </p>
            <a
              className="contact-action btn-secondary"
              href={campusUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore STI website{" "}
              <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <div className="contact-order-note">
              <h3>For order-specific help</h3>
              <p>
                Start with <Link to="/orders">My Orders</Link> for your latest
                status.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section
        className="contact-support"
        aria-labelledby="contact-support-heading"
      >
        <p className="contact-eyebrow">GET HELP WITH</p>
        <h2 id="contact-support-heading">
          <span className="contact-copy-desktop">
            Choose the right next step
          </span>
          <span className="contact-copy-tablet">
            What do you need help with?
          </span>
          <span className="contact-copy-mobile">Find your next step</span>
        </h2>
        <p className="contact-description">
          Three direct paths to the information or assistance you need.
        </p>
        <ol className="contact-support-grid">
          {supportItems.map(
            (
              { title, description, tablet, mobile, label, to, href, external },
              index,
            ) => (
              <li className="contact-support-card" key={title}>
                <span className="contact-support-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{title}</h3>
                <p>
                  <span className="contact-copy-desktop">{description}</span>
                  <span className="contact-copy-tablet">{tablet}</span>
                  <span className="contact-copy-mobile">{mobile}</span>
                </p>
                {to ? (
                  <Link
                    className="contact-support-link contact-support-link-primary"
                    to={to}
                  >
                    {label}{" "}
                    <ArrowRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <a
                    className="contact-support-link"
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {label}{" "}
                    <ArrowUpRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    {external && (
                      <span className="sr-only">
                        {" "}
                        (Google Maps, opens in a new tab)
                      </span>
                    )}
                  </a>
                )}
              </li>
            ),
          )}
        </ol>
      </section>
    </div>
  </div>
);

export default Contact;
