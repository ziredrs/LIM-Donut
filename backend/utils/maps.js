const error = (message, status = 422) => Object.assign(new Error(message), { status });
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function localAddress(address) {
  const text = normalize(address);
  return /nghia tan|cau giay|hoan kiem|to hieu|tho nhuom/.test(text) && !text.includes('ha noi') ? `${address}, Hà Nội, Việt Nam` : address;
}
function validCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
async function geocodeAddress(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  try {
    if (key) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.search = new URLSearchParams({ address: localAddress(address), components: 'country:VN', language: 'vi', key });
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(result.status)) throw error('Google Maps chưa sẵn sàng. Vui lòng kiểm tra API key, Geocoding API và Billing ở backend.', 503);
      const place = result.results?.find(row => !row.partial_match && ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(row.geometry?.location_type));
      const lat = place?.geometry?.location?.lat, lng = place?.geometry?.location?.lng;
      if (!validCoordinates(lat, lng)) throw error('Google Maps chưa xác định rõ số nhà này. Vui lòng kiểm tra lại địa chỉ đầy đủ; hệ thống chưa kết luận địa chỉ vượt 15 km.');
      return { lat, lng, label: address, resolvedLabel: place.formatted_address, precision: 'house', source: 'google' };
    }
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: localAddress(address), format: 'json', limit: '5', countrycodes: 'vn', addressdetails: '1' });
    const response = await fetch(url, { headers: { 'User-Agent': 'LIMDonut-demo/1.0 (delivery address lookup)' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw error('Dịch vụ định vị tạm thời không phản hồi. Vui lòng thử lại; chưa thể xác định phạm vi giao hàng.', 503);
    const rows = await response.json();
    const requestedNumber = address.match(/^\s*(\d+[\p{L}\d/-]*)/u)?.[1];
    const valid = rows.filter(row => validCoordinates(Number(row.lat), Number(row.lon)));
    const place = valid.find(row => row.address?.house_number && (!requestedNumber || normalize(row.address.house_number).replace(/\s/g, '') === normalize(requestedNumber)));
    if (place) return { lat: Number(place.lat), lng: Number(place.lon), label: address, resolvedLabel: place.display_name || address, precision: 'house', source: 'osm' };
    // Checkout's approximation is usable only for a matching road in the explicitly identified city.
    const streetText = normalize(address.split(',')[0].replace(/^\s*\d+[\p{L}\d/-]*\s*/u, '')).replace(/^(pho|duong)\s+/, '').trim();
    const cityKnown = normalize(localAddress(address)).includes('ha noi');
    const street = cityKnown && streetText.length >= 4 && valid.find(row =>
      !row.address?.house_number && row.address?.road &&
      (row.address['ISO3166-2-lvl4'] === 'VN-HN' || normalize(row.address.city || '').includes('ha noi')) &&
      normalize(row.address.road).includes(streetText));
    if (street) return { lat: Number(street.lat), lng: Number(street.lon), label: address, resolvedLabel: street.display_name, precision: 'street', source: 'osm' };
    throw error('Chưa xác định được đúng số nhà hoặc đường của địa chỉ này. Vui lòng nhập đầy đủ phường, quận và thành phố; hệ thống chưa kết luận vượt 15 km.');
  } catch (err) {
    if (err.status) throw err;
    throw error('Không thể xác định vị trí lúc này. Vui lòng thử lại; hệ thống chưa kết luận địa chỉ vượt 15 km.', 503);
  }
}
async function googleDrivingDistance(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw error('Chưa cấu hình Google Maps.', 503);
  try {
    const location = point => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } });
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify({ origin: location(origin), destination: location(destination), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'vi', units: 'METRIC' }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json();
    if (!response.ok) throw error('Không lấy được tuyến đường Google Maps. Vui lòng kiểm tra Routes API và Billing ở backend.', 503);
    const meters = result.routes?.[0]?.distanceMeters;
    if (!Number.isFinite(meters) || meters < 0) throw error('Google Maps chưa tìm được tuyến đường giao hàng. Chưa thể kết luận địa chỉ ngoài 15 km.');
    return meters / 1000;
  } catch (err) {
    if (err.status) throw err;
    throw error('Google Maps tạm thời không phản hồi. Vui lòng thử lại.', 503);
  }
}
module.exports = { geocodeAddress, googleDrivingDistance, localAddress };
