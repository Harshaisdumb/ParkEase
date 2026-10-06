# 🚗 ParkEase India - Smart Parking Solution for Tier-1 Cities

A modern web application built using **HTML5, Tailwind CSS, Leaflet.js, and Vanilla JavaScript** that helps urban commuters quickly locate, verify, and reserve parking spaces in crowded Tier-1 Indian cities (Delhi NCR, Bengaluru, Mumbai, Pune, and Hyderabad).

---

## 🎯 The Problem We Are Solving
In Tier-1 cities across India:
- Drivers waste **15–25 minutes** circling commercial blocks to find parking.
- Risk of heavy **police towing challans (₹1,500–₹2,500)** due to unauthorized street parking.
- Lack of price transparency and unauthorized parking extortions.
- Congestion near metro stations, malls, and tech parks.

**ParkEase** provides 100% authorized, tow-free, real-time parking discovery with digital slot reservation and FASTag support.

---

## ✨ Key Features
1. **Interactive Real-Time Map**:
   - Built on Leaflet.js and OpenStreetMap (100% free, no API keys required).
   - Dynamic pulsing pins color-coded by availability:
     - 🟢 **Green**: 15+ Slots Available
     - 🟡 **Amber**: Filling Fast (< 15 Slots)
     - 🔴 **Red**: Urgent (< 5 Slots Free)
2. **Real-Time GPS Near-Me Detection**:
   - Detects user location via HTML5 Geolocation.
   - Calculates distance (in km) to every spot and sorts by nearest.
3. **Multi-Vehicle Support**:
   - 🛵 2-Wheeler (Bikes / Scooters)
   - 🚗 4-Wheeler (Hatchback / Sedan)
   - 🚙 SUV / MUV
   - ⚡ EV Fast Charging Bays
4. **FASTag & Towing-Free Guarantee**:
   - Filters spots that support RFID FASTag auto-debit barriers.
   - 100% verified municipal or private authorized spaces (no towing risk).
5. **Instant Booking & Smart Digital Pass**:
   - Input vehicle number plate and duration.
   - Dynamic price calculator with GST & convenience fee breakdown.
   - Simulated UPI QR & FASTag checkout.
   - Generates a **Digital Smart Pass** with QR code, slot assignment (e.g. `B2 - #42`), and a direct link to navigate via Google Maps.
6. **"List Your Space" (Monetize Driveways)**:
   - Residents and shop owners can list empty driveways/plots.
   - Interactive monthly earnings calculator based on local hourly rates.
7. **Offline / Local Persistence**:
   - Bookings and passes are saved to browser `localStorage` and can be viewed anytime via the "My Passes" drawer.

---

## 🚀 How to Run the Website

Simply double click `index.html` or open it in any browser (Google Chrome, Microsoft Edge, Firefox, Brave, Safari).
No installation, Node.js, or compilation required!

```bash
# Path to open:
C:\Users\Hemant\.gemini\antigravity\scratch\parkease\index.html
```

---

## 📁 Project Structure
```
parkease/
├── index.html          # Main application page & modals
├── css/
│   └── style.css       # Custom styles, pins, badge tags & pass layout
├── js/
│   ├── data.js         # Realistic parking dataset across Delhi NCR, Mumbai, BLR, Pune, Hyd
│   └── app.js          # Core logic (Map, GPS, filters, booking & QR passes)
└── README.md           # Documentation
```
