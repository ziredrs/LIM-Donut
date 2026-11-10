const { geocodeAddress, googleDrivingDistance, localAddress } = require('../utils/maps');
const originalEnv = { ...process.env };
beforeEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });
afterEach(() => { jest.restoreAllMocks(); process.env = { ...originalEnv }; });
test('local Hanoi address is contextualized without moving a fully specified address', () => {
  expect(localAddress('111A11 Nghĩa Tân')).toContain('Hà Nội');
  expect(localAddress('111A11 Nghĩa Tân, Hà Nội')).toBe('111A11 Nghĩa Tân, Hà Nội');
});
test('ward or road centroid is not a precise address and is never an out-of-range result', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '10', lon: '106', address: { suburb: 'Nghia Tan' } }] });
  await expect(geocodeAddress('111A11 Nghĩa Tân')).rejects.toMatchObject({ status: 422 });
});
test('mismatched house number is rejected', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '21.04', lon: '105.79', address: { house_number: '11' } }] });
  await expect(geocodeAddress('111A11 Nghĩa Tân')).rejects.toMatchObject({ status: 422 });
});
test('matching Hanoi road is accepted as explicit checkout-style approximation', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '21.0432782', lon: '105.7907356', display_name: 'Ngõ 101 phố Nghĩa Tân, Phường Nghĩa Đô, Hà Nội', address: { road: 'Ngõ 101 phố Nghĩa Tân', city: 'Thành phố Hà Nội', 'ISO3166-2-lvl4': 'VN-HN' } }] });
  const address = '111A11 Nghĩa Tân, Nghĩa Đô, Hà Nội';
  expect(await geocodeAddress(address)).toMatchObject({ label: address, precision: 'street', source: 'osm', lat: 21.0432782 });
});
test('a road with same name in another province is not accepted for Hanoi address', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '10.79', lon: '107.72', address: { road: 'Nghĩa Tân', city: 'Lâm Đồng' } }] });
  await expect(geocodeAddress('111A11 Nghĩa Tân, Hà Nội')).rejects.toMatchObject({ status: 422 });
});
test('Google geocoding accepts rooftop result, keeps API key on server', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'OK', results: [{ geometry: { location: { lat: 21.04, lng: 105.79 }, location_type: 'ROOFTOP' }, formatted_address: '111A11 Nghĩa Tân, Hà Nội' }] }) });
  expect(await geocodeAddress('111A11 Nghĩa Tân')).toMatchObject({ source: 'google', lat: 21.04, lng: 105.79 });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get('components')).toBe('country:VN');
});
test('partial Google match is not used as precise location', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'OK', results: [{ partial_match: true, geometry: { location: { lat: 21.04, lng: 105.79 }, location_type: 'ROOFTOP' } }] }) });
  await expect(geocodeAddress('111A11 Nghĩa Tân')).rejects.toMatchObject({ status: 422 });
});
test('Google Routes uses driving distance in meters with a minimal response field mask', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ routes: [{ distanceMeters: 550 }] }) });
  expect(await googleDrivingDistance({ lat: 21, lng: 105 }, { lat: 21.01, lng: 105.01 })).toBe(.55);
  const request = fetch.mock.calls[0][1];
  expect(request.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
  expect(JSON.parse(request.body).travelMode).toBe('DRIVE');
});
test('Google failures do not silently fall back to a different distance method', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: async () => ({}) });
  await expect(googleDrivingDistance({ lat: 21, lng: 105 }, { lat: 21, lng: 105 })).rejects.toMatchObject({ status: 503 });
});
