/* ลายเซ็น S3 v4 และการอ่านค่า B2 จาก env */
const test = require('node:test');
const assert = require('node:assert/strict');
const { signV4, b2Config } = require('./b2.js');

test('ลายเซ็นตรงกับตัวอย่าง GET Object ในเอกสาร AWS Signature v4', () => {
  const h = signV4({
    method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1',
    keyId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', date: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

const full = { B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', B2_BUCKET: 'b', B2_KEY_ID: 'k', B2_APPLICATION_KEY: 'secret-value' };

test('ไม่ตั้ง B2 เลย = ไม่สำรอง', () => assert.equal(b2Config({}), null));

test('อ่าน region จาก endpoint และตั้งชื่อไฟล์ตั้งต้น', () => {
  assert.deepEqual(b2Config(full), { base: 'https://s3.us-west-004.backblazeb2.com', bucket: 'b', keyId: 'k', secret: 'secret-value', region: 'us-west-004', objectKey: 'iegen/iegen.sqlite' });
});

test('ตั้งไม่ครบ บอกชื่อที่ขาดแต่ไม่พิมพ์ค่าลับ', () => {
  const { B2_KEY_ID, ...partial } = full;
  assert.throws(() => b2Config(partial), (e) => e.message.includes('B2_KEY_ID') && !e.message.includes('secret-value'));
});

test('endpoint ต้องเป็น https ยกเว้นเครื่องตัวเอง', () => {
  assert.throws(() => b2Config({ ...full, B2_ENDPOINT: 'http://s3.us-west-004.backblazeb2.com' }), /https/);
  assert.equal(b2Config({ ...full, B2_ENDPOINT: 'http://127.0.0.1:9000', B2_REGION: 'x' }).base, 'http://127.0.0.1:9000');
  assert.throws(() => b2Config({ ...full, B2_ENDPOINT: 'http://127.0.0.1:9000' }), /B2_REGION/);
});
