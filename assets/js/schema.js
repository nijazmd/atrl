// Utilities to work with header-by-name (never rely on column order)
const Schema = (() => {
  function mapHeader(headerRow) {
    const map = {};
    headerRow.forEach((h, i) => { map[String(h).trim()] = i; });
    return map;
  }

  function rowToObj(row, headerMap) {
    const obj = {};
    Object.keys(headerMap).forEach((k) => {
      obj[k] = row[headerMap[k]];
    });
    return obj;
  }

  function rowsToObjs(rows) {
    if (!rows || !rows.length) return [];
    const header = rows[0];
    const map = mapHeader(header);
    return rows.slice(1).map(r => rowToObj(r, map));
  }

  return { mapHeader, rowToObj, rowsToObjs };
})();
