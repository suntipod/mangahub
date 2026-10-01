# 📖 MangaHub Tracker

**MangaHub Tracker** คือเว็บแอปพลิเคชันสำหรับนักอ่านการ์ตูน/มังงะ/มันฮวา ออกแบบมาเพื่อแก้ปัญหา **"เปิดแท็บใน iPhone Safari ค้างไว้เป็นร้อยๆ แท็บจนแท็บหาย"** และ **"เว็บการ์ตูนชอบปลิว โดนปิด จนจำไม่ได้ว่าอ่านถึงไหน"**

รองรับการใช้งานทั้งบน **iPhone (PWA - Add to Home Screen)** และ **คอมพิวเตอร์ (Web Browser)** พร้อมระบบ **Realtime Cloud Sync ด้วย Supabase (Free Tier)**

---

## ✨ ฟังก์ชันเด่นที่สร้างขึ้น

1. **กู้ชีพแท็บ Safari (Smart URL Scraper):**
   - เพียงแค่ก๊อปปี้ URL หน้าการ์ตูนหรือตอนล่าสุดที่เปิดค้างไว้ใน Safari มาวาง ระบบจะดึง **ชื่อเรื่อง, รูปภาพปก, และเลขตอน** ให้อัตโนมัติใน 1 วินาที
   - มี **โหมดทยอยกู้ชีพแท็บ (Batch Mode)** วางทีละเรื่องแล้วกดปิดแท็บใน Safari ทิ้งได้เลยอย่างสบายใจ
2. **ผูกหลายเว็บอ่านต่อ 1 เรื่อง (Multi-Source Hub):**
   - 1 เรื่องสามารถผูกได้ทั้งเว็บหลักและเว็บสำรอง (เช่น Up-Manga, Slow-Manga, Chibi-Manga ฯลฯ)
   - หากเว็บใดเว็บหนึ่งล่มหรือโดนปิด สามารถกดสลับไปอ่านเว็บสำรองได้ทันทีในคลิกเดียว
3. **1-Tap Reading Flow:**
   - ปุ่ม **"อ่านต่อ"**: เปิดหน้าเว็บตอนปัจจุบันทันที
   - ปุ่ม **"+1"**: กดเพิ่มเลขตอนทันทีเมื่ออ่านจบตอน โดยระบบจะคำนวณ URL ตอนถัดไปให้อัตโนมัติ
4. **Supabase Realtime Cloud Sync:**
   - อ่านและกดอัปเดตบนมือถือ เปิดคอมพิวเตอร์มาข้อมูลจะอัปเดตตรงกันแบบ Realtime (ใช้ฟรีตลอดชีพ)
   - มีระบบ **Local-First**: ใช้งานแบบออฟไลน์ได้ทันทีแม้ยังไม่ได้ต่อเน็ตหรือยังไม่ได้ใส่ Key
5. **iPhone PWA Ready:**
   - เปิดใน Safari แล้วกด **"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"** จะกลายเป็นแอปเต็มจอ ไม่มีแถบ Safari เกะกะ

---

## 🚀 วิธีเปิดใช้งาน

### 1. เปิดใช้งานบนคอมพิวเตอร์
```bash
# ติดตั้ง dependencies (ติดตั้งไว้แล้ว)
npm install

# รันโหมด Development
npm run dev

# หรือรันโหมด Production (เร็วและเสถียรสุด)
npm run build
npm run start
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

---

### 2. วิธีเปิดบน iPhone ผ่าน Wi-Fi เดียวกัน
1. ตรวจสอบ IP เครื่องคอมพิวเตอร์ (พิมพ์ `ipconfig` ใน PowerShell ดู IPv4 Address เช่น `192.168.1.50`)
2. เปิด iPhone Safari เข้าไปที่: `http://192.168.1.50:3000`
3. กดปุ่ม **แชร์ (Share)** ด้านล่างจอ Safari -> เลือก **"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"**

---

### 3. วิธีเชื่อมต่อ Supabase Cloud Database (ใช้งานฟรีตลอดชีพ)
1. สมัครใช้งานที่ [supabase.com](https://supabase.com) (ฟรี) แล้วกด **New Project**
2. ไปที่เมนู **SQL Editor** ด้านซ้าย นำโค้ดจากไฟล์ `supabase/schema.sql` ไปวางแล้วกด **Run**
3. ไปที่ **Project Settings** > **API** ก๊อปปี้:
   - **Project URL**
   - **anon / public key**
4. เปิดหน้าเว็บ MangaHub กดไอคอน **ตั้งค่า (ฟันเฟือง)** แล้วนำ URL กับ Key มาวาง จากนั้นเปิดสวิตช์ Cloud Sync ได้ทันที!

---

## 🛠️ โครงสร้างเทคโนโลยีที่ใช้
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS (Dark Manga Bookshelf Theme)
- **Scraper Engine:** Cheerio + Metadata Resolver
- **Database:** Supabase (PostgreSQL + Realtime WebSocket) + LocalStorage Cache
- **Icons:** Lucide React
- **PWA:** Web App Manifest + iOS Translucent Status Bar
