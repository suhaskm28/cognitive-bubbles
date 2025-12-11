# Cognitive Bubbles 🧠

**Cognitive Bubbles** is an interactive arithmetic game designed to test and improve your numerical reasoning speed.

Players must select bubbles containing arithmetic expressions  **from the lowest to the highest value** —all within a 10-second limit per round.

---

## 🎮 Gameplay Overview

* Each round presents **three bubbles** with randomly generated integer-based arithmetic expressions.
* You must **click** each bubble in ascending order of its evaluated value.
* Each set has a  **10-second timer** .
* There are **15 rounds** per session, with difficulty increasing level by level.
* At the end, you’ll receive your  **final score** ,  **accuracy** , and a detailed result summary.

---

## 🧩 Features

* Dynamic expression generation with level-based difficulty (Easy → Medium → Hard)
* Positive integer operands only (no negatives or fractions)
* Responsive UI with smooth animations
* Real-time feedback for correct/incorrect selections
* Keyboard shortcuts (`1`, `2`, `3`, `Space`, `R`)
* Built-in timer and auto-advance between rounds
* Final performance summary after completing all rounds

---

## ⚙️ Tech Stack

* **React 18** (Vite + TypeScript)
* **Tailwind CSS v4** for styling
* **Framer Motion** for animations
* **Lucide Icons** for visuals
* **shadcn/ui** components for clean UI design

---

## 🚀 Getting Started

### 1️⃣ Clone the repository

```bash
git clone https://github.com/<your-username>/cognitive-bubbles.git
cd cognitive-bubbles
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Run locally

```bash
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173/)** to play locally.

### 4️⃣ Build for production

```bash
npm run build
npm run preview
```

---

## 🌐 Deployment

This project is optimized for deployment on  **Vercel** .

* Build command: `vite build`
* Output directory: `dist`

---

## 📄 License

This project is released under the  **MIT License** .
