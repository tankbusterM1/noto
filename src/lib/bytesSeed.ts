import type { ByteCard } from './bytes';

/*
 * The starter pack — correct, sourced, hand-written. Loaded on demand from the
 * Bytes deck ("Load starter pack"). Fixed ids so re-loading dedups instead of
 * duplicating. Cards are stamped with `updatedAt` at load time.
 */
export const STARTER_BYTES: Omit<ByteCard, 'updatedAt'>[] = [
  { id: 'b_ml_attention', pack: 'foundations', topic: 'ml', level: 1, title: 'Attention is a weighted average', blurb: "Each token's new vector is a softmax-weighted sum of every other token's value. The weights ARE the attention — that's how a transformer reads a sentence whole, with no recurrence.", source: 'Vaswani et al., 2017' },
  { id: 'b_ml_gradient', pack: 'foundations', topic: 'ml', level: 1, title: 'Gradient descent walks downhill', blurb: 'The gradient points toward steepest increase of the loss. Step the opposite way, a little at a time, and you slide toward a minimum. The step size is the learning rate.' },
  { id: 'b_ml_lr', pack: 'foundations', topic: 'ml', level: 1, title: 'Learning rate: the Goldilocks knob', blurb: 'Too high and training diverges; too low and it crawls or gets stuck. Most tuning pain is really learning-rate pain.' },
  { id: 'b_ml_overfit', pack: 'foundations', topic: 'ml', level: 2, title: 'Overfitting is memorising', blurb: 'Low training error but high test error means the model memorised noise. Cures: more data, regularisation, dropout, or a simpler model.' },
  { id: 'b_ml_biasvar', pack: 'foundations', topic: 'ml', level: 2, title: 'Bias vs variance', blurb: 'High bias underfits (too simple). High variance overfits (too flexible, swings with the data). You trade one for the other.' },
  { id: 'b_ml_softmax', pack: 'foundations', topic: 'ml', level: 2, title: 'Softmax turns scores into probabilities', blurb: 'Exponentiate each logit, then divide by the sum. Output is positive and sums to 1 — a probability distribution over classes.', code: 'p_i = exp(z_i) / sum(exp(z_j))', lang: 'text' },
  { id: 'b_ml_backprop', pack: 'foundations', topic: 'ml', level: 3, title: 'Backprop is just the chain rule', blurb: "Multiply local derivatives backward through the network to get each weight's effect on the loss. Nothing mystical — calculus, layer by layer." },
  { id: 'b_ai_tokens', pack: 'foundations', topic: 'ai', level: 1, title: 'LLMs think in tokens, not words', blurb: "Text is split into tokens (~4 chars). The model predicts the next token, over and over. The 'context window' is how many it can see at once." },
  { id: 'b_ai_temp', pack: 'foundations', topic: 'ai', level: 2, title: 'Temperature = how bold the guess', blurb: 'It reshapes the next-token odds. Near 0 = always the likeliest token (focused). Higher = flatter odds (creative, riskier).' },
  { id: 'b_ai_halluc', pack: 'foundations', topic: 'ai', level: 2, title: "Why models 'hallucinate'", blurb: 'An LLM predicts plausible text, not verified truth. Fluent-and-wrong is a normal output. Grounding it in real sources (RAG) is how you fight it.' },
  { id: 'b_sql_leftjoin', pack: 'foundations', topic: 'sql', level: 1, title: 'LEFT JOIN keeps every left row', blurb: "Unmatched right-side columns come back NULL — so a LEFT JOIN never drops a row from the left table. Filter for the NULLs to find 'has none'.", code: 'SELECT u.name\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nWHERE o.id IS NULL;', lang: 'sql' },
  { id: 'b_sql_wherehaving', pack: 'foundations', topic: 'sql', level: 2, title: 'WHERE before, HAVING after', blurb: "WHERE filters rows before grouping. HAVING filters groups after aggregation. You can't put an aggregate in WHERE.", code: 'SELECT dept, COUNT(*)\nFROM emp\nGROUP BY dept\nHAVING COUNT(*) > 5;', lang: 'sql' },
  { id: 'b_sql_null', pack: 'foundations', topic: 'sql', level: 1, title: 'NULL equals nothing', blurb: "NULL means 'unknown', so NULL = NULL is not true — it's NULL. Always test with IS NULL / IS NOT NULL, never = NULL." },
  { id: 'b_sql_index', pack: 'foundations', topic: 'sql', level: 2, title: 'Indexes trade writes for reads', blurb: 'An index is a sorted lookup: it makes matching queries fast, but every insert/update must maintain it. Index what you filter and join on — not everything.' },
  { id: 'b_py_comprehension', pack: 'foundations', topic: 'python', level: 1, title: 'Comprehensions build; loops mutate', blurb: 'One expression returns a new list — clearer and faster than appending in a loop.', code: 'squares = [n*n for n in xs if n % 2 == 0]', lang: 'python' },
  { id: 'b_py_defaultarg', pack: 'foundations', topic: 'python', level: 3, title: 'The mutable-default trap', blurb: "A default list is created once, at definition — so it's SHARED across calls and quietly accumulates. Use None and make a fresh one inside.", code: 'def add(x, acc=None):\n    acc = acc or []\n    acc.append(x)\n    return acc', lang: 'python' },
  { id: 'b_py_iseq', pack: 'foundations', topic: 'python', level: 2, title: 'is vs ==', blurb: "== asks 'equal value?'. is asks 'the exact same object?'. Use == for values; reserve is for None." },
  { id: 'b_py_generator', pack: 'foundations', topic: 'python', level: 3, title: 'Generators are lazy', blurb: 'yield produces values one at a time, on demand — so you can stream millions of items without holding them all in memory.', code: 'def evens():\n    n = 0\n    while True:\n        yield n\n        n += 2', lang: 'python' },
  { id: 'b_stat_corr', pack: 'foundations', topic: 'stats', level: 1, title: "Correlation isn't causation", blurb: 'Two things moving together may share a hidden cause, or be coincidence. A correlation is a hypothesis, not a conclusion.' },
  { id: 'b_stat_pvalue', pack: 'foundations', topic: 'stats', level: 3, title: 'What a p-value actually says', blurb: "It's the chance of data this extreme IF the null hypothesis were true. It is NOT the probability the null is true, and not the size of an effect." },
  { id: 'b_stat_median', pack: 'foundations', topic: 'stats', level: 1, title: 'Median shrugs off outliers', blurb: 'One billionaire wrecks the mean income of a room but barely moves the median. For skewed data, the median is the honest "typical".' },
  { id: 'b_cs_bigo', pack: 'foundations', topic: 'cs', level: 1, title: 'Big-O is about growth', blurb: 'It describes how work scales as input grows, ignoring constants. O(n) doubles when input doubles; O(n²) quadruples; O(log n) barely moves.' },
  { id: 'b_cs_hash', pack: 'foundations', topic: 'cs', level: 2, title: 'Hash tables are O(1) on average', blurb: 'A hash maps a key straight to a bucket, so lookup/insert average constant time — the magic behind dict and set. Worst case degrades with collisions.' },
  { id: 'b_cs_idempotent', pack: 'foundations', topic: 'cs', level: 2, title: 'Idempotent = safe to retry', blurb: 'An operation you can run twice with the same result (like PUT or DELETE). It is what lets a flaky network retry without doubling the effect.' },
];

/*
 * The SQL pack — original cards covering the standard Basic-SQL curriculum
 * (SELECT · WHERE · AND/OR/NOT · BETWEEN · IN · LIKE · ORDER BY · grouping).
 * Written from scratch, not lifted from any tutorial; SQL facts, my own words.
 */
export const SQL_BYTES: Omit<ByteCard, 'updatedAt'>[] = [
  { id: 'b_sql_what', pack: 'sql', topic: 'sql', level: 1, title: 'SQL asks questions of tables', blurb: 'SQL reads and writes relational databases — data as rows and columns. You describe WHAT you want back; the engine works out how to fetch it.' },
  { id: 'b_sql_select', pack: 'sql', topic: 'sql', level: 1, title: 'SELECT picks columns', blurb: 'Name the columns you want (or * for all of them) and the table to read from.', code: 'SELECT name, salary\nFROM employees;', lang: 'sql' },
  { id: 'b_sql_where', pack: 'sql', topic: 'sql', level: 1, title: 'WHERE filters rows', blurb: 'It keeps only rows whose condition is true. Text values go in single quotes.', code: "SELECT *\nFROM employees\nWHERE dept = 'Sales';", lang: 'sql' },
  { id: 'b_sql_andornot', pack: 'sql', topic: 'sql', level: 1, title: 'AND, OR, NOT combine conditions', blurb: 'AND needs both true, OR needs either, NOT flips one. Parenthesise to make precedence explicit.', code: "WHERE dept = 'Sales'\n  AND (salary > 50000 OR bonus > 0);", lang: 'sql' },
  { id: 'b_sql_between', pack: 'sql', topic: 'sql', level: 1, title: 'BETWEEN is an inclusive range', blurb: 'BETWEEN a AND b matches from a to b, both endpoints included. Works on numbers, dates and text.', code: 'WHERE age BETWEEN 18 AND 30;', lang: 'sql' },
  { id: 'b_sql_in', pack: 'sql', topic: 'sql', level: 1, title: 'IN matches a set', blurb: 'IN (…) is shorthand for a stack of OR-equals — cleaner than chaining them.', code: "WHERE country IN ('US', 'UK', 'CA');", lang: 'sql' },
  { id: 'b_sql_like', pack: 'sql', topic: 'sql', level: 2, title: 'LIKE matches patterns', blurb: "% stands for any run of characters, _ for exactly one. So 'A%' means starts-with-A.", code: "WHERE name LIKE 'A%'    -- starts with A\n   OR name LIKE '_o%';  -- 'o' as 2nd letter", lang: 'sql' },
  { id: 'b_sql_orderby', pack: 'sql', topic: 'sql', level: 1, title: 'ORDER BY sorts the result', blurb: 'ASC is ascending (the default), DESC descending. List several columns to sort left to right.', code: 'ORDER BY salary DESC, name ASC;', lang: 'sql' },
  { id: 'b_sql_distinct', pack: 'sql', topic: 'sql', level: 2, title: 'DISTINCT drops duplicates', blurb: 'It returns each unique row (or unique value, for a single column) — handy for "what values exist here?".', code: 'SELECT DISTINCT country\nFROM customers;', lang: 'sql' },
  { id: 'b_sql_limit', pack: 'sql', topic: 'sql', level: 1, title: 'LIMIT caps the rows', blurb: 'Return only the first N rows. Pair it with ORDER BY to get a real "top N".', code: 'SELECT name FROM players\nORDER BY score DESC\nLIMIT 10;', lang: 'sql' },
  { id: 'b_sql_null2', pack: 'sql', topic: 'sql', level: 2, title: 'Test NULL with IS, not =', blurb: "NULL means unknown, so NULL = NULL isn't true. Filter with IS NULL / IS NOT NULL.", code: 'WHERE manager_id IS NULL;', lang: 'sql' },
  { id: 'b_sql_alias', pack: 'sql', topic: 'sql', level: 2, title: 'AS renames a column or table', blurb: 'An alias gives a column a friendlier output name, or a table a short handle to use in joins.', code: 'SELECT salary * 12 AS annual_pay\nFROM employees AS e;', lang: 'sql' },
  { id: 'b_sql_groupby', pack: 'sql', topic: 'sql', level: 2, title: 'GROUP BY collapses rows into groups', blurb: 'One output row per group, with aggregates — COUNT, SUM, AVG, MIN, MAX — computed within each group.', code: 'SELECT dept, AVG(salary)\nFROM employees\nGROUP BY dept;', lang: 'sql' },
  { id: 'b_sql_having2', pack: 'sql', topic: 'sql', level: 3, title: 'HAVING filters groups', blurb: 'WHERE filters rows before grouping; HAVING filters the groups after — the only place an aggregate belongs in a filter.', code: 'GROUP BY dept\nHAVING COUNT(*) > 5;', lang: 'sql' },
  { id: 'b_sql_order_exec', pack: 'sql', topic: 'sql', level: 3, title: 'SQL runs in a different order than you write it', blurb: 'Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT. That is why a SELECT alias cannot be used back in WHERE.' },
  { id: 'b_sql_comment', pack: 'sql', topic: 'sql', level: 1, title: 'Comment with -- or /* */', blurb: '-- comments to the end of the line; /* … */ spans lines. Leave a note on the tricky bits.', code: '-- active users only\nWHERE active = 1; /* soft-deletes excluded */', lang: 'sql' },
];

/** Everything a "load starter pack" ships — foundations + the SQL pack. */
export const ALL_SEED_BYTES: Omit<ByteCard, 'updatedAt'>[] = [...STARTER_BYTES, ...SQL_BYTES];
