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

const About = () => (
  <div className="about-page">
    <div className="about-container">
      <section className="about-hero" aria-labelledby="about-heading">
        <nav className="about-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">About Us</span>
        </nav>
        <div className="about-hero-copy">
          <div className="about-intro">
            <p className="about-eyebrow">School essentials, simplified</p>
            <h1 id="about-heading">
              ABOUT <span>US</span>
            </h1>
          </div>
          <p className="about-subheadline">
            A simpler way to manage school essentials.
          </p>
          <p className="about-description">
            <span className="about-copy-desktop">
              PAMO / SmartStock connects students and school staff through one
              organized uniform-ordering platform. Browse essentials, place
              orders, and follow their progress in one place.
            </span>
            <span className="about-copy-tablet">
              PAMO / SmartStock connects students and school staff through one
              organized uniform-ordering platform.
            </span>
            <span className="about-copy-mobile">
              PAMO / SmartStock connects students and staff through one
              organized uniform-ordering platform. Browse essentials, place
              orders, and follow their progress.
            </span>
          </p>
          <div className="about-actions">
            <Link to="/collection" className="home-brand-action">
              Explore Collection{" "}
              <ArrowRight
                className="storefront-action-icon"
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </Link>
            <Link to="/contact" className="home-outline-action">
              Contact Us
            </Link>
          </div>
        </div>
        <figure className="about-photo">
          <div className="about-photo-inner">
            <img
              src={assets.about_img}
              alt="STI College Carmona students in school uniforms with sports, music, and campus activity essentials"
              width="728"
              height="1098"
              decoding="async"
            />
          </div>
        </figure>
        <section className="about-values" aria-label="Core values">
          <p className="about-eyebrow about-values-kicker">What we value</p>
          <dl>
            {values.map(([title, description]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>

      <section
        className="about-ordering"
        aria-labelledby="about-ordering-heading"
      >
        <div className="about-ordering-copy">
          <header className="about-section-accent">
            <p className="about-eyebrow">
              <span className="about-copy-nontablet">The student journey</span>
              <span className="about-copy-tablet">How PAMO works</span>
            </p>
            <h2 id="about-ordering-heading">
              <span className="about-copy-nontablet">How ordering works</span>
              <span className="about-copy-tablet">
                From shopping to claiming
              </span>
            </h2>
          </header>
          <p className="about-ordering-description">
            <span className="about-copy-desktop">
              PAMO keeps the key steps together, so you can focus on getting the
              right essentials for campus.
            </span>
            <span className="about-copy-tablet">
              Students see the steps; staff coordinate inventory and fulfillment
              behind the scenes.
            </span>
          </p>
          <p className="about-staff-note">
            Behind the scenes, PAMO staff manage products, stock and order
            coordination.
          </p>
        </div>
        <ol className="about-steps">
          {steps.map(([title, description, mobileDescription], index) => (
            <li key={title}>
              <span className="about-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{title}</h3>
                <p>
                  <span className="about-copy-wide">{description}</span>
                  <span className="about-copy-mobile">{mobileDescription}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="about-mission"
        aria-labelledby="about-mission-heading"
      >
        <h2 id="about-mission-heading">
          OUR <span>MISSION</span>
        </h2>
        <p>
          Our mission is to make school uniform ordering more organized and
          transparent. By connecting browsing, size and stock information, order
          placement, payment options and order tracking, we aim to make the
          process easier for students and school staff.
        </p>
      </section>

      <section
        className="about-benefits"
        aria-labelledby="about-benefits-heading"
      >
        <p className="about-eyebrow">Why PAMO?</p>
        <h2 id="about-benefits-heading">Built around practical needs</h2>
        <p className="about-benefits-description">
          Three specific ways the platform supports the campus experience.
        </p>
        <ul className="about-benefit-grid">
          {benefits.map(
            ([label, title, description, mobileDescription], index) => (
              <li key={title}>
                <p className="about-benefit-label">
                  {String(index + 1).padStart(2, "0")} / {label}
                </p>
                <h3>{title}</h3>
                <p className="about-benefit-description">
                  <span className="about-copy-wide">{description}</span>
                  <span className="about-copy-mobile">{mobileDescription}</span>
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
