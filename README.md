# 🚗 ParkEase India - Smart Parking & Urban Mobility Platform

A comprehensive, cutting-edge urban parking and mobility web application built using **HTML5, Tailwind CSS, Leaflet.js, Google Maps JavaScript API, and Vanilla JavaScript**.

Designed specifically to eliminate the biggest urban commute bottlenecks across Indian Tier-1 cities (**Delhi NCR, Bengaluru, Mumbai, Pune, and Hyderabad**).

---

## 🌟 Advanced Features List

### 1. 🅿️ Visual 2D/3D Parking Floor Plan (BookMyShow-Style Slot Picker)
- Live interactive basement layout (**Floor B1 & Floor B2**).
- Color-coded live slot statuses:
  - 🟩 **Green (Available)**: Standard vehicle slot.
  - ⚡ **Indigo (EV Bay)**: High-speed electric charger slot.
  - 🟥 **Gray (Occupied)**: Real-time booked bay.
  - 🟦 **Sky Blue (Selected)**: Glowing selection with proximity indicator (e.g. *“15m from Elevator 1”*).
- Click any available slot to lock and assign it directly to your reservation pass.

### 2. 📲 Instant WhatsApp Smart Pass Sharing
- **1-Click WhatsApp Send**: Generates an official, pre-formatted WhatsApp pass with ticket QR link, allocated slot number, vehicle plate, validity timestamp, and direct Google Maps navigation link.
- Ideal for sharing passes with drivers, family members, or gate security.

### 3. 🗣️ Bilingual Voice Guidance (Hindi & English)
- Integrated Web Speech API audio navigator.
- Announces barrier clearance and turn directions directly to the driver:
  - *“Welcome to ParkEase. Please proceed to Basement B2 - Slot #14. Boom barrier is open.”*

### 4. ⚡ EV Smart Battery & Charger Reservation
- Choose your EV brand: Tata Nexon EV, MG ZS EV, Mahindra XUV400, Ather 450X, Ola S1 Pro.
- Select charger power rating:
  - **7.4 kW AC** (Fast)
  - **30 kW DC** (Rapid)
  - **60 kW DC** (Ultra-Fast)
- Dynamically calculates power fees and displays reserved EV fast charging bays.

### 5. 🏷️ 30-Day Monthly Corporate Pass (Save 35%)
- Designed for office commuters in tech parks (DLF Cyber City, BKC Mumbai, Indiranagar / ITPL Bengaluru, Hinjewadi Pune, Hitec City Hyderabad).
- Switch between **Hourly / Daily Pass** and **30-Day Monthly Corporate Pass** with a single click.
- Automatic FASTag RFID barrier clearance without daily checkouts.

### 6. 🤖 AI ANPR Smart Boom Barrier Simulator
- Interactive hardware demo:
  - Simulates car approaching the parking entrance.
  - Optical AI camera sweeps over the license plate with laser scanning effect.
  - Verifies FASTag / Pass validity with 99.4% confidence.
  - Automatically swings the boom barrier open with realistic audio chime and countdown timer!

### 7. 🚨 Anti-Challan Tow-Truck Warning Radar
- Proactively protects commuters from heavy police towing fines (**₹1,500 towing + ₹500 no-parking challan = ₹2,000 penalty**).
- Real-time radar radar sweep alerting users near high-risk unauthorized towing zones.
- **1-Click Rescue**: Automatically finds the nearest municipal authorized lot within 250m and routes the driver there immediately.

### 8. ⭐ Post-Service Rating & Verified Commuter Reviews
- **After-Service Trigger**: Finish parking with 1-click directly from the Smart QR Pass modal, My Bookings drawer, or parking hub cards to review the service.
- **Interactive 5-Star Rating**: Dynamic star hover & click animations with reactive sentiment feedback (*“Outstanding - Lightning-fast entry, spotless & 100% safe”*).
- **Service Quality Tag Chips**: Multi-select pills (*“Instant FASTag Gate”*, *“Spotless Basement”*, *“Helpful Guard”*, *“Fast EV Charger”*, *“100% Safe CCTV”*).
- **Gate Speed & Safety Assessment**: Quick rating on gate clearance time and facility lighting.
- **Ground Staff Tip**: Optional tip chips for parking attendants/guards (*₹10, ₹20, ₹50*).
- **Live Score Recalculation**: Dynamically updates the facility's average rating and total reviews count on map pins and cards, persisted permanently via `localStorage`.
- **Verified Community Feed**: Real-time review feed on the homepage with car model badges, driver tags, and feedback.

---

## 🗺️ Integrated Map APIs

### 1. Dual Map Engine (Google Maps API + OpenStreetMap)
- **OpenStreetMap + Leaflet (Default, 100% Free)**:
  - Runs out-of-the-box with zero keys or billing required.
  - Pulsing availability markers (Green, Amber, Red).
- **Google Maps JavaScript API**:
  - Full official Google Maps integration (`maps.googleapis.com`).
  - Supports **Live Real-time Traffic Layer** (`google.maps.TrafficLayer`), Satellite, and Street View.
  - Configure your API Key directly from the top navigation bar.

### 2. Live Geocoding Search API (Photon / OSM)
- Search any market, colony, metro station, or street in India (*“Connaught Place”, “Koramangala”, “Bandra West”, “Whitefield”*).
- Live autocomplete dropdown with instant map flight and distance calculation.

### 3. Turn-by-Turn Driving Route API (OSRM)
- Calculates actual road driving route between user's GPS and the parking garage.
- Draws an animated road polyline on the map.
- Real-time banner with driving distance (e.g. `4.2 km`) and estimated travel time (`~12 mins driving`).

---

## 🚀 How to Run the Website

Simply double click `run.bat` or `index.html` or open it in any modern browser (Chrome, Edge, Firefox, Brave, Safari).
No installation, Node.js, or compilation required!

```bash
# Project Folder location:
C:\Users\Hemant\.gemini\antigravity\scratch\parkease\
```

---

## 📁 Project Architecture (Single-Folder Layout)
All code files are kept cleanly in one single folder without complex subdirectories:
```
parkease/
├── index.html          # Responsive UI, floor plan grid, ANPR gate, towing radar & modals
├── style.css           # Visual floor layout, boom barrier animation, radar ring & badges
├── data.js             # Realistic parking dataset across Delhi NCR, Mumbai, BLR, Pune, Hyd
├── app.js              # Core controller, Leaflet/Google Maps, OSRM route, speech & booking
├── run.bat             # 1-Click launcher to open the project immediately
└── README.md           # Complete documentation & features guide
```
