// Deep links Sherr I hands to the phone. Every builder is pure (easy to test).
// Only URL patterns we have seen working are used; when a site has no public
// search link we open its home page and show the trip details on the card.

const enc = encodeURIComponent;

/** "98765 43210" / "+91-98765-43210" / "098765 43210" -> "919876543210" (null if not a number) */
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

const slug = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));
}

// ---------------------------------------------------------------- talk
export function whatsappLink(phone, text) {
  const p = normalizePhone(phone);
  // wa.me without a number lets the person pick the chat inside WhatsApp
  return p ? `https://wa.me/${p}?text=${enc(text)}` : `https://wa.me/?text=${enc(text)}`;
}

export function smsLink(phone, text) {
  const p = normalizePhone(phone);
  return `sms:${p ? "+" + p : ""}?body=${enc(text)}`;
}

export function callLink(phone) {
  const p = normalizePhone(phone);
  return p ? `tel:+${p}` : null;
}

// --------------------------------------------------------------- travel
export function flightLinks({ from, to, date }) {
  const q = `Flights from ${from} to ${to}${date ? ` on ${date}` : ""}`;
  return [
    { label: "MakeMyTrip", url: `https://www.makemytrip.com/flights/${slug(from)}-${slug(to)}-cheap-airtickets.html` },
    { label: "Google Flights", url: `https://www.google.com/travel/flights?q=${enc(q)}` },
  ];
}

export function trainLinks({ from, to }) {
  return [
    { label: "ConfirmTkt / ixigo", url: `https://www.ixigo.com/by-train-rail/${slug(from)}-to-${slug(to)}-by-train` },
    { label: "IRCTC", url: "https://www.irctc.co.in/nget/train-search" },
  ];
}

export function busLinks({ from, to, date }) {
  return [
    { label: "redBus", url: "https://www.redbus.in/" },
    { label: "Google", url: `https://www.google.com/search?q=${enc(`bus ${from} to ${to} ${date ?? ""}`.trim())}` },
  ];
}

export function hotelLinks({ city, checkin, checkout, guests = 2, budget }) {
  const booking = "https://www.booking.com/searchresults.html?" +
    new URLSearchParams({ ss: city, checkin, checkout, group_adults: String(guests), no_rooms: "1" }).toString();
  let words = `hotels in ${city} ${checkin} to ${checkout} for ${guests}`;
  if (budget) words += ` under ₹${budget} per night`;
  return [
    { label: "MakeMyTrip Hotels", url: "https://www.makemytrip.com/hotels/" },
    { label: "Booking.com", url: booking },
    { label: "Google Hotels", url: `https://www.google.com/travel/search?q=${enc(words)}` },
  ];
}

// ------------------------------------------------------------- everyday
const SHOPS = {
  amazon: (q) => `https://www.amazon.in/s?k=${enc(q)}`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${enc(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`,
  maps: (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`,
  google: (q) => `https://www.google.com/search?q=${enc(q)}`,
  swiggy: () => "https://www.swiggy.com/",
  zomato: () => "https://www.zomato.com/",
  blinkit: () => "https://blinkit.com/",
  zepto: () => "https://www.zeptonow.com/",
  uber: () => "https://m.uber.com/",
  rapido: () => "https://www.rapido.bike/",
  instagram: () => "https://www.instagram.com/",
  higgsfield: () => "https://higgsfield.ai/",
};
export const OPENABLE = Object.keys(SHOPS);

export function openLink(app, query = "") {
  const f = SHOPS[String(app).toLowerCase()];
  return f ? f(query) : null;
}

/** Google Calendar "add event" link (30 min) — works on every phone */
export function calendarLink(title, whenIso) {
  const start = new Date(whenIso);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60_000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(title)}&dates=${f(start)}/${f(end)}`;
}
