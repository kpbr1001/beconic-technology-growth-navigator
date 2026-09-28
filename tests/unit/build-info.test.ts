import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { BUILD_INFO, versionLabel } from '../../src/build-info';

describe('버전·업데이트 일자 표기', () => {
  it('package.json 버전과 빌드 날짜(YYYY.MM.DD)를 주입한다', () => {
    expect(BUILD_INFO.version).toBe(pkg.version);
    expect(BUILD_INFO.date).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    expect(versionLabel()).toBe(`v${pkg.version} · ${BUILD_INFO.date} 업데이트`);
  });
});
