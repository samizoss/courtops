/**
 * The Jar brand tokens + club facts. Hard-coded for the pilot;
 * structured so this becomes per-club config later.
 */
export const JAR_BRAND = {
  colors: {
    blue: '#004a8d',      // primary — headings, dark bg, buttons
    red: '#b42033',       // accents, CTAs, urgency
    navy: '#26256e',      // depth, alt dark bg
    lightBlue: '#65bee5', // highlights on dark bg
    cream: '#fffffb',     // light bg
    charcoal: '#231f20',  // body text
    gold: '#d4af37',      // premium only — NOT used in newsletter/digest
  },
  fonts: {
    heading: "'Days One', Montserrat, Impact, 'Arial Black', sans-serif", // ALWAYS ALL CAPS
    body: "'Montserrat', Calibri, Arial, sans-serif",
  },
  club: {
    name: 'The Jar Pickleball Club',
    address: '3701 S. Western Ave., Sioux Falls, SD',
    email: 'contactpbj@thepbjar.com',
    site: 'https://thepbjar.com',
    hours: 'Sun 8am–8pm | Mon/Wed 7am–9pm | Tue/Thu 5am–9pm | Fri/Sat 7am–10pm',
    tagline: 'Where Fun Meets Fierce Competition',
    timezone: 'America/Chicago',
    socials: {
      instagram: 'https://www.instagram.com/thejarpickleballclub/',
      facebook: 'https://www.facebook.com/thejarpickleballclub/',
      facebookGroup: 'https://www.facebook.com/share/g/1DGYNhVqYR/',
    },
    logoUrl: 'https://tgcstorage.blob.core.windows.net/court-reserve-13403/c4a7193c-7c56-4fa9-bd30-51bacb88bd4d.jpg',
  },
} as const
