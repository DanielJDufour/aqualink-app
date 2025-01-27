import moment from 'moment-timezone';

export function getStartEndDate(endDate: Date, hours: number = 24) {
  const endMoment = moment(endDate);
  const startMoment = endMoment.clone().subtract(hours, 'hours');
  return [startMoment.format(), endMoment.format()];
}

// Util function to get the [startDate, endDate] time interval for time series data.
// If no value for endDate is passed, then we define endDate as "now".
// If no value for startDate is passed, then we define startDate as three months before the endDate.
export function getTimeSeriesDefaultDates(start?: string, end?: string) {
  const endDate = end ? new Date(end) : new Date();
  const startDate = start
    ? new Date(start)
    : new Date(new Date(endDate).setMonth(endDate.getMonth() - 3));

  return { startDate, endDate };
}
