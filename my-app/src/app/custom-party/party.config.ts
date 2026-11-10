export interface PartyTier {
  id: 'S' | 'M' | 'L';
  name: string;
  quantity: number;
  leadTimeDays: number;
  price: number;
  cancelDeadlineHours: number;
  depositPercent: number;
  limits: { shape: number; flavor: number; sauce: number; topping: number };
}

export type ShapeGeometry = 'torus' | 'square' | 'heart' | 'star' | 'hexagon';

export interface ShapeOption {
  id: string;
  name: string;
  icon: string;
  geometry: ShapeGeometry;
  available: boolean;
}

export interface FlavorOption {
  id: string;
  name: string;
  description: string;
  longNote: string;
  baseColor: string;
  innerColor: string;
  available: boolean;
}

export type SauceCoverage = 'full' | 'half' | 'drizzle';

export interface SauceOption {
  id: string;
  name: string;
  color: string;
  glossy: boolean;
  available: boolean;
}

export interface ToppingOption {
  id: string;
  name: string;
  imageUrl: string;
  particleColors: string[];
  particleShape: 'circle' | 'rect' | 'line';
  available: boolean;
}

export const SURCHARGE = {
  shape: 5000,
  flavor: 10000,
  sauce: 5000,
  topping: 3000,
} as const;

export const PARTY_TIERS: PartyTier[] = [
  {
    id: 'S', name: 'Party S', quantity: 12, leadTimeDays: 1,
    price: 599000, cancelDeadlineHours: 12, depositPercent: 30,
    limits: { shape: 1, flavor: 2, sauce: 1, topping: 2 },
  },
  {
    id: 'M', name: 'Party M', quantity: 24, leadTimeDays: 2,
    price: 1199000, cancelDeadlineHours: 12, depositPercent: 40,
    limits: { shape: 2, flavor: 3, sauce: 2, topping: 3 },
  },
  {
    id: 'L', name: 'Party L', quantity: 36, leadTimeDays: 3,
    price: 3399000, cancelDeadlineHours: 24, depositPercent: 50,
    limits: { shape: 99, flavor: 99, sauce: 99, topping: 99 },
  },
];

export const SHAPES: ShapeOption[] = [
  { id: 'round',    name: 'Tròn',       icon: 'bi-circle',   geometry: 'torus',   available: true },
  { id: 'square',   name: 'Vuông',      icon: 'bi-square',   geometry: 'square',  available: true },
  { id: 'heart',    name: 'Trái tim',   icon: 'bi-heart',    geometry: 'heart',   available: true },
  { id: 'star',     name: 'Ngôi sao',   icon: 'bi-star',     geometry: 'star',    available: true },
];

export const FLAVORS: FlavorOption[] = [
  { id: 'chocolate',  name: 'Chocolate',       description: 'Đậm đà cacao nguyên chất',        longNote: 'Cốt bánh trộn bột cacao nguyên chất, vị đắng nhẹ đầu lưỡi rồi ngọt sâu dần, hợp với người thích vị đậm. Gợi ý kết hợp: Sốt Caramel + Hạnh nhân lát để cân bằng vị đắng bằng chút béo bùi.', baseColor: '#5C3317', innerColor: '#3E1F0D', available: true },
  { id: 'matcha',     name: 'Matcha',          description: 'Trà xanh Nhật Bản thơm dịu',      longNote: 'Bột matcha Uji Nhật Bản đánh cùng bơ lạt, thơm cỏ non và chát dịu cuối vị, ít ngọt hơn các vị khác. Gợi ý kết hợp: White Chocolate + Mè rang để vị trà nổi bật mà vẫn tròn miệng.', baseColor: '#7BA05B', innerColor: '#5A7A3A', available: true },
  { id: 'vanilla',    name: 'Vani',            description: 'Hương vani ngọt ngào kinh điển',   longNote: 'Vani Madagascar tự nhiên, ngọt thanh dễ ăn nhất menu — an toàn cho tiệc có trẻ em và người lớn tuổi. Gợi ý kết hợp: Sốt Dâu tây + Cốm màu cho set tiệc rực rỡ, hoặc Sốt Chocolate cổ điển.', baseColor: '#F5E6C8', innerColor: '#E0CC9E', available: true },
  { id: 'strawberry', name: 'Dâu tây',        description: 'Dâu tây tươi chua nhẹ',            longNote: 'Dâu tây Đà Lạt xay nhuyễn trộn thẳng vào bột, chua ngọt tự nhiên, thơm mùi trái cây tươi chứ không phải hương liệu. Gợi ý kết hợp: Cream Cheese + Vụn Oreo — cặp đôi "cheesecake dâu" được đặt nhiều nhất.', baseColor: '#F8A4B8', innerColor: '#E87F98', available: true },
  { id: 'caramel',    name: 'Caramel',         description: 'Caramel mặn bơ Pháp',              longNote: 'Caramel nấu từ bơ Pháp với chút muối biển, béo mặn-ngọt đan xen kiểu salted caramel. Gợi ý kết hợp: Sốt Chocolate + Chocolate chip cho vị đậm, hoặc Chà bông nếu muốn thử mặn-ngọt kiểu Việt.', baseColor: '#D4A04A', innerColor: '#B8842E', available: true },
  { id: 'ube',        name: 'Khoai lang tím',  description: 'Ube Philippines ngọt bùi',         longNote: 'Khoai lang tím ube nghiền mịn, ngọt bùi và dẻo nhẹ, màu tím tự nhiên lên hình rất đẹp. Gợi ý kết hợp: Dừa sợi + White Chocolate — bộ ba ube-dừa kinh điển của món tráng miệng Philippines.', baseColor: '#9B6DC6', innerColor: '#7B4DA6', available: true },
  { id: 'coffee',     name: 'Cà phê',         description: 'Cà phê sữa Việt Nam đậm vị',       longNote: 'Cà phê robusta pha phin đặc trộn sữa đặc, đắng đậm rồi ngọt béo hậu vị — đúng chất cà phê sữa Việt Nam. Gợi ý kết hợp: Sốt Caramel + Hạnh nhân lát, hoặc Vụn Oreo cho cảm giác "bạc xỉu tráng miệng".', baseColor: '#8B6914', innerColor: '#6F4E0E', available: true },
  { id: 'coconut',    name: 'Dừa',            description: 'Dừa tươi béo ngậy',                longNote: 'Nước cốt dừa tươi vắt trong ngày, béo ngậy thơm dịu, không gắt. Gợi ý kết hợp: Dừa sợi + Sốt Matcha cho vị nhiệt đới thanh mát, hoặc Maple Syrup nếu thích ngọt ấm.', baseColor: '#FAF0DC', innerColor: '#E8DEC4', available: true },
  { id: 'taro',       name: 'Khoai môn',      description: 'Khoai môn dẻo thơm',               longNote: 'Khoai môn cao sản nghiền dẻo, bùi thơm nhẹ nhàng, ngọt vừa phải. Gợi ý kết hợp: Cream Cheese + Dừa sợi — vị bùi gặp béo chua nhẹ rất hợp nhau.', baseColor: '#C4A4D8', innerColor: '#A484B8', available: false },
];

export const SAUCE_COVERAGES: { id: SauceCoverage; name: string; icon: string }[] = [
  { id: 'full',    name: 'Phủ toàn bộ',  icon: 'bi-circle-fill' },
  { id: 'half',    name: 'Nhúng nửa',    icon: 'bi-circle-half' },
  { id: 'drizzle', name: 'Rưới vân',     icon: 'bi-water' },
];

export const SAUCES: SauceOption[] = [
  { id: 'chocolate-sauce', name: 'Sốt Chocolate',  color: '#3E2723', glossy: true, available: true },
  { id: 'white-choco',     name: 'White Chocolate', color: '#FFF8E7', glossy: true, available: true },
  { id: 'caramel-sauce',   name: 'Sốt Caramel',    color: '#D4A017', glossy: true, available: true },
  { id: 'strawberry-sauce',name: 'Sốt Dâu tây',    color: '#E91E63', glossy: true, available: true },
  { id: 'matcha-sauce',    name: 'Sốt Matcha',     color: '#4CAF50', glossy: true, available: true },
  { id: 'cream-cheese',    name: 'Cream Cheese',    color: '#FFF9E8', glossy: false, available: true },
  { id: 'maple',           name: 'Maple Syrup',     color: '#C68E17', glossy: true, available: true },
  { id: 'mentaiko',        name: 'Sốt Mentaiko',   color: '#FF6B6B', glossy: false, available: true },
  { id: 'gochujang',       name: 'Sốt Gochujang',  color: '#D32F2F', glossy: false, available: false },
];

export const TOPPINGS: ToppingOption[] = [
  { id: 'sprinkles',     name: 'Cốm màu',       imageUrl: '/toppings/sprinkles.png',     particleColors: ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#FF8B94','#6C5CE7'], particleShape: 'rect', available: true },
  { id: 'oreo-crumb',    name: 'Vụn Oreo',       imageUrl: '/toppings/oreo-crumb.png',    particleColors: ['#1a1a1a','#333','#666','#f5f5f5'], particleShape: 'circle', available: true },
  { id: 'almond',        name: 'Hạnh nhân lát',  imageUrl: '/toppings/almond.png',        particleColors: ['#D4A76A','#C49A5C','#E0BC80'], particleShape: 'rect', available: true },
  { id: 'coconut-flake', name: 'Dừa sợi',       imageUrl: '/toppings/coconut-flake.png', particleColors: ['#FFF8F0','#F5ECD7','#FFF5E6'], particleShape: 'line', available: true },
  { id: 'choco-chip',    name: 'Chocolate chip', imageUrl: '/toppings/choco-chip.png',    particleColors: ['#3E2723','#5D4037','#4E342E'], particleShape: 'circle', available: true },
  { id: 'pistachio',     name: 'Hạt dẻ cười',   imageUrl: '/toppings/pistachio.png',     particleColors: ['#8BC34A','#689F38','#AED581'], particleShape: 'circle', available: true },
  { id: 'cha-bong',      name: 'Chà bông',      imageUrl: '/toppings/cha-bong.png',      particleColors: ['#D4A04A','#C49A3C','#E0B858'], particleShape: 'line', available: true },
  { id: 'sesame',        name: 'Mè rang',        imageUrl: '/toppings/sesame.png',        particleColors: ['#F5F5DC','#E8E0C0','#1a1a1a'], particleShape: 'circle', available: true },
  { id: 'cereal',        name: 'Ngũ cốc',       imageUrl: '/toppings/cereal.png',        particleColors: ['#FFD54F','#FF8A65','#A1887F','#81C784'], particleShape: 'circle', available: true },
  { id: 'marshmallow',   name: 'Marshmallow',    imageUrl: '/toppings/marshmallow.png',   particleColors: ['#FFFFFF','#FFF0F5','#F0F8FF'], particleShape: 'circle', available: false },
];

export type CategoryKey = 'shape' | 'flavor' | 'sauce' | 'topping';

export interface DonutVariant {
  id: number;
  shapeId: string;
  flavorId: string;
  sauceId: string;
  sauceCoverage: SauceCoverage;
  toppingIds: string[];
  quantity: number;
}

export interface ToppingParticle {
  x: number;
  y: number;
  size: number;
  imageUrl: string;
  rotation: number;
}

export function generateParticles(toppingIds: string[], seed: number = 42): ToppingParticle[] {
  const particles: ToppingParticle[] = [];
  const activeToppings = TOPPINGS.filter(t => toppingIds.includes(t.id));
  if (activeToppings.length === 0) return [];

  let rng = seed;
  const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; };

  const count = Math.min(activeToppings.length * 12, 48);
  for (let i = 0; i < count; i++) {
    const topping = activeToppings[i % activeToppings.length];
    const angle = rand() * Math.PI * 2;
    const dist = 28 + rand() * 18;
    const x = 50 + Math.cos(angle) * dist;
    const y = 50 + Math.sin(angle) * dist;

    const dx = x - 50, dy = y - 50;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 16 || r > 48) continue;

    particles.push({
      x, y,
      size: 2 + rand() * 3,
      imageUrl: topping.imageUrl,
      rotation: rand() * 360,
    });
  }
  return particles;
}
