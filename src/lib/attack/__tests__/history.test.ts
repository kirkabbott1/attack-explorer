import { readQuery, writeQuery } from '../history';

describe('attack URL state', () => {
  afterEach(() => {
    // Reset the URL so tests do not leak query state into one another.
    window.history.replaceState(null, '', '/');
  });

  test('readQuery parses the current query string into a record', () => {
    window.history.replaceState(null, '', '/?platform=Linux&tactic=TA0001');
    expect(readQuery()).toEqual({ platform: 'Linux', tactic: 'TA0001' });
  });

  test('readQuery returns an empty record when there is no query string', () => {
    window.history.replaceState(null, '', '/');
    expect(readQuery()).toEqual({});
  });

  test('writeQuery replaces the URL query string', () => {
    writeQuery({ platform: 'Windows', focus: 'T1059' });
    expect(window.location.search).toBe('?platform=Windows&focus=T1059');
  });

  test('writeQuery with an empty record clears the query string', () => {
    window.history.replaceState(null, '', '/?platform=Windows');
    writeQuery({});
    expect(window.location.search).toBe('');
  });
});
