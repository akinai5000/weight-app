import {
  SEED_YEAR_END_DATE,
  verifySeedYearChartDummyBuild,
} from '../constants/seedYearChartDummy.ts';

const result = verifySeedYearChartDummyBuild();
for (const line of result.messages) {
  console.log(line);
}
console.log(result.ok ? 'OK' : 'FAILED');
process.exit(result.ok ? 0 : 1);
