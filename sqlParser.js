export const cleanSql = (sql) => {
  if (!sql) return "";
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "") // remove multi-line comments
    .replace(/--.*$/gm, "")          // remove single-line comments
    .replace(/[\[\]]/g, "")          // remove brackets [ ]
    .replace(/\b(?:dbo|schema)\./gi, "") // remove dbo. or schema. prefixes
    .trim();
};

export const stripSubqueries = (sql) => {
  let result = "";
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === '(') {
      depth++;
    }
    if (depth === 0) {
      result += char;
    }
    if (char === ')') {
      depth--;
      if (depth < 0) depth = 0;
    }
  }
  return result;
};

export const getTableAliases = (tableName, rawSql) => {
  const aliases = [tableName];
  if (!tableName || !rawSql) return aliases;
  try {
    const cleaned = cleanSql(rawSql);
    const escapedTabName = tableName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regexAs = new RegExp(`\\b${escapedTabName}\\s+AS\\s+(\\w+)\\b`, 'i');
    const matchAs = cleaned.match(regexAs);
    if (matchAs && matchAs[1]) {
      aliases.push(matchAs[1]);
    }
    const regexNoAs = new RegExp(`\\b${escapedTabName}\\s+(\\w+)\\b`, 'i');
    const matchNoAs = cleaned.match(regexNoAs);
    if (matchNoAs && matchNoAs[1]) {
      const aliasCandidate = matchNoAs[1];
      const keywords = new Set(['join', 'on', 'where', 'set', 'with', 'left', 'right', 'inner', 'outer', 'cross', 'natural', 'as', 'and', 'or', 'group', 'order', 'limit']);
      if (!keywords.has(aliasCandidate.toLowerCase())) {
        aliases.push(aliasCandidate);
      }
    }
  } catch (e) {}
  return Array.from(new Set(aliases));
};

/**
 * Resolves which columns of a table are accessed in the raw SQL code.
 * Supports SELECT *, SELECT alias.*, explicit columns, and aliases.
 */
export const getAccessedFields = (tableName, fieldsList, rawSql) => {
  if (!tableName || !fieldsList || !rawSql) return [];
  
  const uniqueAliases = getTableAliases(tableName, rawSql);

  let selectAll = false;
  try {
    const selectAllRegex = /\bselect\s+[^;]*\b\*\b/i;
    if (selectAllRegex.test(rawSql)) {
      selectAll = true;
    }
    for (const alias of uniqueAliases) {
      const aliasStarRegex = new RegExp(`\\b${alias}\\s*\\.\\s*\\*`, 'i');
      if (aliasStarRegex.test(rawSql)) {
        selectAll = true;
        break;
      }
    }
  } catch (e) {}

  if (selectAll) {
    return fieldsList;
  }

  return fieldsList.filter(f => {
    if (!f || !f.name) return false;
    try {
      const escapedName = f.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      // 1. Tablonun kendi alias'ları ile prefix edilmiş mi? (örn: uss.UsersId)
      for (const alias of uniqueAliases) {
        const aliasFieldRegex = new RegExp(`\\b${alias}\\s*\\.\\s*${escapedName}\\b`, 'i');
        if (aliasFieldRegex.test(rawSql)) {
          return true;
        }
      }
      
      // 2. Standalone olarak mı geçiyor veya kendi alias'ımızla mı prefix edilmiş?
      const standaloneRegex = new RegExp(`\\b${escapedName}\\b`, 'i');
      if (standaloneRegex.test(rawSql)) {
        const pattern = new RegExp(`(?:(\\w+)\\s*\\.\\s*)?\\b${escapedName}\\b`, 'gi');
        let match;
        while ((match = pattern.exec(rawSql)) !== null) {
          const prefix = match[1];
          if (!prefix || uniqueAliases.some(a => a.toLowerCase() === prefix.toLowerCase())) {
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  });
};

export const getWhereConditions = (tableName, fieldsList, rawSql) => {
  if (!tableName || !fieldsList || !rawSql) return {};
  const fieldConditions = {};
  
  const cleaned = cleanSql(rawSql);
  const uniqueAliases = getTableAliases(tableName, cleaned);

  try {
    const stripped = stripSubqueries(cleaned);
    const whereMatch = stripped.match(/\bwhere\b([\s\S]*?)(?:$|;|group\s+by|order\s+by|union)/i);
    if (whereMatch && whereMatch[1]) {
      const whereClause = whereMatch[1];
      const parts = whereClause.split(/\band\b|\bor\b/i);
      for (const part of parts) {
        const trimmed = part.trim().replace(/\s+/g, ' ');
        
        for (const field of fieldsList) {
          if (!field || !field.name) continue;
          
          const escapedFieldName = field.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          let matchFound = false;
          
          for (const alias of uniqueAliases) {
            const aliasFieldRegex = new RegExp(`\\b${alias}\\s*\\.\\s*${escapedFieldName}\\b`, 'i');
            if (aliasFieldRegex.test(trimmed)) {
              matchFound = true;
              break;
            }
          }
          
          if (!matchFound) {
            const standaloneRegex = new RegExp(`\\b${escapedFieldName}\\b`, 'i');
            if (standaloneRegex.test(trimmed)) {
              const prefixMatch = trimmed.match(new RegExp(`(\\w+)\\s*\\.\\s*${escapedFieldName}\\b`, 'i'));
              if (!prefixMatch || uniqueAliases.includes(prefixMatch[1])) {
                matchFound = true;
              }
            }
          }

          if (matchFound) {
            if (!fieldConditions[field.name]) {
              fieldConditions[field.name] = [];
            }
            fieldConditions[field.name].push(trimmed);
          }
        }
      }
    }
  } catch (e) {}

  return fieldConditions;
};

export const getSelectAndFromParts = (sql) => {
  const cleaned = cleanSql(sql);
  const selectIndex = cleaned.search(/\bselect\b/i);
  if (selectIndex === -1) return null;
  
  let depth = 0;
  let fromIndex = -1;
  
  for (let i = selectIndex + 6; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth < 0) depth = 0;
    }
    
    if (depth === 0) {
      const check5 = cleaned.substring(i, i + 5).toLowerCase();
      const check6 = cleaned.substring(i, i + 6).toLowerCase();
      if (check5 === "from " || check6 === "from\n" || check6 === "from\r") {
        const prevChar = i > 0 ? cleaned[i - 1] : "";
        if (!prevChar.match(/[a-z0-9_]/i)) {
          fromIndex = i;
          break;
        }
      }
    }
  }
  
  if (fromIndex === -1) return null;
  
  return {
    selectContent: cleaned.substring(selectIndex + 6, fromIndex).trim(),
    fromContent: cleaned.substring(fromIndex).trim()
  };
};

export const getProjectedColumns = (rawSql, tablesList = []) => {
  if (!rawSql) return [];
  try {
    const parts = getSelectAndFromParts(rawSql);
    if (!parts) return [];

    const { selectContent, fromContent } = parts;
    const cleanSqlStr = cleanSql(rawSql);

    // --- Detect GROUP BY columns ---
    const groupBySet = new Set();
    const groupByMatch = cleanSqlStr.match(/\bgroup\s+by\b([\s\S]*?)(?:having|order\s+by|$)/i);
    if (groupByMatch) {
      groupByMatch[1].split(',').forEach(item => {
        const name = item.trim().split(/\s+/).pop().replace(/[\[\]"'`]/g, '').toLowerCase();
        if (name) groupBySet.add(name);
      });
    }

    // --- Detect JOIN types per table ---
    const joinTypeMap = getJoinTypes(rawSql); // { TableName: "LEFT JOIN", ... }

    const columns = [];
    let current = "";
    let parenCount = 0;
    for (let i = 0; i < selectContent.length; i++) {
      const char = selectContent[i];
      if (char === '(') parenCount++;
      else if (char === ')') {
        parenCount--;
        if (parenCount < 0) parenCount = 0;
      }

      if (char === ',' && parenCount === 0) {
        columns.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      columns.push(current.trim());
    }

    // Build alias mapping: for each table in tablesList, find its aliases in the query
    const tableAliasMap = [];
    tablesList.forEach(table => {
      const aliases = [table.name];
      try {
        const escapedTabName = table.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexAs = new RegExp(`\\b${escapedTabName}\\s+AS\\s+(\\w+)\\b`, 'i');
        const matchAs = cleanSqlStr.match(regexAs);
        if (matchAs && matchAs[1]) {
          aliases.push(matchAs[1]);
        }
        const regexNoAs = new RegExp(`\\b${escapedTabName}\\s+(\\w+)\\b`, 'i');
        const matchNoAs = cleanSqlStr.match(regexNoAs);
        if (matchNoAs && matchNoAs[1]) {
          const aliasCandidate = matchNoAs[1];
          const keywords = new Set(['join', 'on', 'where', 'set', 'with', 'left', 'right', 'inner', 'outer', 'cross', 'natural', 'as', 'and', 'or', 'group', 'order', 'limit']);
          if (!keywords.has(aliasCandidate.toLowerCase())) {
            aliases.push(aliasCandidate);
          }
        }
      } catch (e) {}
      tableAliasMap.push({ table, aliases: Array.from(new Set(aliases)) });
    });

    // Helper: find which table a column expression belongs to
    const resolveJoinType = (expression) => {
      const exprLower = expression.toLowerCase();
      for (const { table, aliases } of tableAliasMap) {
        for (const alias of aliases) {
          if (exprLower.startsWith(`${alias.toLowerCase()}.`)) {
            return joinTypeMap[table.name] || null;
          }
        }
      }
      return null;
    };

    const parsedColumns = [];
    columns.forEach(colStr => {
      const cleanColStr = colStr.replace(/\s+/g, ' ').trim();
      if (!cleanColStr) return;

      // Check if it is a wildcard projection
      // 1. alias.*
      const aliasStarMatch = cleanColStr.match(/^(\w+)\s*\.\s*\*$/i);
      if (aliasStarMatch) {
        const targetAlias = aliasStarMatch[1].toLowerCase();
        const mapping = tableAliasMap.find(m => m.aliases.some(a => a.toLowerCase() === targetAlias));
        if (mapping) {
          const jt = joinTypeMap[mapping.table.name] || null;
          mapping.table.fields.forEach(f => {
            const isGrp = groupBySet.has(f.name.toLowerCase());
            parsedColumns.push({
              name: f.name,
              expression: `${aliasStarMatch[1]}.${f.name}`,
              isAggregated: false,
              isCalculated: false,
              isGroupBy: isGrp,
              joinType: jt
            });
          });
          return;
        }
      }

      // 2. *
      if (cleanColStr === "*") {
        // Expand for all tables that appear in the query
        tableAliasMap.forEach(mapping => {
          const fromPart = cleanSqlStr.substring(cleanSqlStr.toLowerCase().indexOf("from"));
          const escapedName = mapping.table.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const isTableInQuery = new RegExp(`\\b${escapedName}\\b`, 'i').test(fromPart);
          if (isTableInQuery) {
            const primaryAlias = mapping.aliases[1] || mapping.table.name;
            const jt = joinTypeMap[mapping.table.name] || null;
            mapping.table.fields.forEach(f => {
              const isGrp = groupBySet.has(f.name.toLowerCase());
              parsedColumns.push({
                name: f.name,
                expression: `${primaryAlias}.${f.name}`,
                isAggregated: false,
                isCalculated: false,
                isGroupBy: isGrp,
                joinType: jt
              });
            });
          }
        });
        return;
      }

      // Standard column parsing
      let name = "";
      let expression = cleanColStr;
      
      const asMatch = cleanColStr.match(/(.+?)\bAS\s+(\w+|\[\w+\]|"\w+")?\s*$/i);
      if (asMatch) {
        expression = asMatch[1].trim();
        name = asMatch[2].replace(/[\[\]"']/g, '').trim();
      } else {
        const noAsMatch = cleanColStr.match(/(.+?)\s+(\w+|\[\w+\]|"\w+")\s*$/);
        if (noAsMatch) {
          const possibleAlias = noAsMatch[2].replace(/[\[\]"']/g, '').trim();
          if (!possibleAlias.includes('(') && !possibleAlias.includes(')') && !possibleAlias.includes('.')) {
            expression = noAsMatch[1].trim();
            name = possibleAlias;
          }
        }
      }

      if (!name) {
        const fieldMatch = cleanColStr.match(/(?:^|.*\.)(\w+)\s*$/);
        if (fieldMatch) {
          name = fieldMatch[1];
        } else {
          name = cleanColStr;
        }
      }

      const hasAgg = /\b(count|sum|avg|min|max|coalesce|isnull|case|when|concat)\b/i.test(expression);
      const isCalculated = /[+\-*\/]/.test(expression) || hasAgg;
      const isGroupBy = groupBySet.has(name.toLowerCase());
      const joinType = resolveJoinType(expression);

      parsedColumns.push({
        name,
        expression,
        isAggregated: hasAgg,
        isCalculated,
        isGroupBy,
        joinType
      });
    });

    return parsedColumns;
  } catch (e) {
    return [];
  }
};

export const getJoinTypes = (rawSql) => {
  if (!rawSql) return {};
  const joinMap = {};
  try {
    const cleanSql = rawSql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, ' ')
      .trim();

    const joinRegex = /\b(left\s+join|right\s+join|inner\s+join|cross\s+join|full\s+join|join)\s+([\w\.\[\]"]+)/gi;
    let match;
    while ((match = joinRegex.exec(cleanSql)) !== null) {
      const joinType = match[1].toUpperCase().replace(/\s+/g, ' ');
      const rawTableName = match[2].replace(/[\[\]"']/g, '').split('.').pop();
      joinMap[rawTableName] = joinType;
    }
  } catch (e) {}
  return joinMap;
};

export const getJoinConditions = (rawSql) => {
  const conditions = {};
  if (!rawSql) return conditions;
  try {
    const cleaned = cleanSql(rawSql);
    const stripped = stripSubqueries(cleaned);
    
    // Regex to match join clauses and extract ON part
    const joinOnRegex = /\bjoin\s+[\w\.\[\]"]+\s+(?:as\s+\w+\s+)?\bon\b\s*([\s\S]*?)(?=\bleft\b|\bright\b|\binner\b|\bjoin\b|\bwhere\b|$|;)/gi;
    let match;
    while ((match = joinOnRegex.exec(stripped)) !== null) {
      const onClause = match[1].trim();
      const parts = onClause.split(/\band\b|\bor\b/i);
      parts.forEach(part => {
        const trimmed = part.trim();
        const fieldsFound = trimmed.match(/[\w\.\[\]]+/g) || [];
        fieldsFound.forEach(f => {
          const fieldName = f.split('.').pop().replace(/[\[\]"']/g, '').trim();
          if (fieldName) {
            if (!conditions[fieldName]) conditions[fieldName] = [];
            if (!conditions[fieldName].includes(trimmed)) {
              conditions[fieldName].push(trimmed);
            }
          }
        });
      });
    }
  } catch (e) {}
  return conditions;
};
