import type { Category, LearningMaterial, Module, Subtopic, Topic } from '@/types/learning-content';

const material = (content: LearningMaterial): LearningMaterial => content;

const subtopic = (
  id: string,
  title: string,
  content: LearningMaterial,
): Subtopic => ({ id, title, ...material(content) });

const topic = (
  id: string,
  title: string,
  summary: string,
  estimatedMinutes: number,
  content: LearningMaterial,
  subtopics: Subtopic[],
): Topic => ({ id, title, summary, estimatedMinutes, ...material(content), subtopics });

const module = (id: string, title: string, description: string, topics: Topic[]): Module => ({
  id,
  title,
  description,
  topics,
});

export const sqlLearningCategories: Category[] = [
  {
    id: 'sql-foundations',
    title: 'SQL Foundations',
    description: 'Build a reliable foundation for reading and writing clear SQL queries.',
    accent: 'blue',
    modules: [
      module('query-basics', 'Query Basics', 'Learn the shape of a query and how to select useful data.', [
        topic(
          'query-structure',
          'The shape of a SQL query',
          'Understand how a SELECT statement describes the rows and columns you want.',
          8,
          {
            explanation: [
              'A SQL query is a request to a database. A basic read query names the columns to return, the table to read from, and optional rules for choosing or ordering rows.',
              'SQL keywords are conventionally written in uppercase for readability. Most database systems do not require this capitalization, and whitespace can be used to make each clause easy to scan.',
            ],
            examples: [
              {
                title: 'Read a complete table',
                explanation: 'Use an explicit projection to make the requested shape clear.',
                code: 'SELECT id, name, email\nFROM customers;',
              },
            ],
            keyPoints: [
              'SELECT names the output columns.',
              'FROM identifies the source table.',
              'A semicolon marks the end of a statement.',
            ],
            commonMistakes: [
              'Using SELECT * in long-lived application queries makes the result depend on every column in the table.',
              'Forgetting which table supplies a column can make a query ambiguous when joins are added.',
            ],
            practiceQuestions: [
              'Write a query that returns the id and title columns from a books table.',
            ],
            interviewQuestions: [
              'What are the roles of SELECT and FROM in a SQL query?',
            ],
          },
          [
            subtopic('select-list', 'Choosing columns', {
              explanation: [
                'The select list is the set of expressions after SELECT. Choose only the values needed by the next step in the application or analysis.',
              ],
              examples: [
                {
                  title: 'Select named columns',
                  explanation: 'Return only the fields needed for a customer directory.',
                  code: 'SELECT name, email\nFROM customers;',
                },
              ],
              keyPoints: ['Column order in SELECT determines result-column order.'],
              commonMistakes: ['Returning unnecessary columns can increase transfer and processing work.'],
              practiceQuestions: ['Select product_name and unit_price from products.'],
              interviewQuestions: ['Why might explicit columns be preferable to SELECT *?'],
            }),
            subtopic('from-source', 'Choosing a source table', {
              explanation: [
                'The FROM clause identifies the table or view that supplies rows to the query.',
              ],
              examples: [
                {
                  title: 'Read from orders',
                  explanation: 'The source is explicit and easy to identify.',
                  code: 'SELECT order_id, created_at\nFROM orders;',
                },
              ],
              keyPoints: ['A table name belongs after FROM.'],
              commonMistakes: ['Using a misspelled or incorrectly qualified table name.'],
              practiceQuestions: ['Which clause identifies where a query reads its rows?'],
              interviewQuestions: ['How does FROM relate to the rows returned by SELECT?'],
            }),
          ],
        ),
        topic(
          'select-expressions',
          'Expressions and aliases',
          'Shape query output with calculated values and readable column names.',
          10,
          {
            explanation: [
              'A select-list item can be a column, a calculation, or a function result. An alias gives an output expression a clear label.',
            ],
            examples: [
              {
                title: 'Calculate and name an expression',
                explanation: 'The alias makes the calculated result self-describing.',
                code: 'SELECT quantity * unit_price AS line_total\nFROM order_items;',
              },
            ],
            keyPoints: [
              'AS introduces a column alias.',
              'Expressions can combine columns and operators.',
            ],
            commonMistakes: [
              'Choosing aliases that duplicate existing column names can confuse downstream consumers.',
            ],
            practiceQuestions: [
              'Return price multiplied by quantity as extended_price from order_items.',
            ],
            interviewQuestions: [
              'What is a column alias, and when would you use one?',
            ],
          },
          [
            subtopic('calculated-columns', 'Calculated columns', {
              explanation: [
                'A calculated column is computed when the query runs and does not change stored table data.',
              ],
              examples: [
                {
                  title: 'Calculate a line amount',
                  explanation: 'Multiply quantity by the per-unit price.',
                  code: 'SELECT quantity * unit_price\nFROM order_items;',
                },
              ],
              keyPoints: ['Calculations can be composed from source columns.'],
              commonMistakes: ['Assuming a calculated expression updates the underlying table.'],
              practiceQuestions: ['Calculate a 10% tax amount from a column named subtotal.'],
              interviewQuestions: ['Are values in a SELECT expression stored back to the table?'],
            }),
            subtopic('column-aliases', 'Readable aliases', {
              explanation: ['Aliases label results for readers and application code.'],
              examples: [
                {
                  title: 'Name a calculated result',
                  explanation: 'Use a concise descriptive output name.',
                  code: 'SELECT unit_price * quantity AS line_total\nFROM order_items;',
                },
              ],
              keyPoints: ['Aliases affect output labels, not stored schema.'],
              commonMistakes: ['Relying on a SELECT alias inside WHERE, where many SQL dialects do not make it available.'],
              practiceQuestions: ['Alias a COUNT result as customer_count.'],
              interviewQuestions: ['Does an alias rename the source table column?'],
            }),
          ],
        ),
      ]),
      module('relational-thinking', 'Working with Rows', 'Filter, sort, and limit result sets with predictable behavior.', [
        topic(
          'where-filters',
          'Filtering rows with WHERE',
          'Choose rows by applying conditions to the source data.',
          12,
          {
            explanation: [
              'WHERE evaluates a condition for each candidate row. Only rows for which the condition is true appear in the result.',
              'Conditions can compare values, combine predicates, and check for ranges or membership. NULL values need explicit NULL-aware checks because ordinary comparisons with NULL are unknown.',
            ],
            examples: [
              {
                title: 'Filter by a value',
                explanation: 'Only active customers are returned.',
                code: "SELECT id, name\nFROM customers\nWHERE status = 'active';",
              },
            ],
            keyPoints: [
              'WHERE filters rows before grouping.',
              'Use AND and OR to combine conditions, with parentheses when the intended logic needs clarification.',
              'Use IS NULL or IS NOT NULL to test NULL values.',
            ],
            commonMistakes: [
              'Writing status = NULL instead of status IS NULL.',
              'Mixing AND and OR without parentheses can produce a different condition than intended.',
            ],
            practiceQuestions: [
              "Return orders with status 'pending' and a total above 100.",
            ],
            interviewQuestions: [
              'How does WHERE differ from HAVING?',
              'Why does comparing a column to NULL with equals not work as expected?',
            ],
          },
          [
            subtopic('comparison-predicates', 'Comparison predicates', {
              explanation: [
                'Comparison operators such as =, <>, >, and <= build conditions using values of compatible types.',
              ],
              examples: [
                {
                  title: 'Compare numeric values',
                  explanation: 'Return products whose price is at least 25.',
                  code: 'SELECT product_name, unit_price\nFROM products\nWHERE unit_price >= 25;',
                },
              ],
              keyPoints: ['Match comparison values to the column data type.'],
              commonMistakes: ['Comparing values as strings when numeric ordering is required.'],
              practiceQuestions: ['Return employees hired after 2024-01-01.'],
              interviewQuestions: ['Which operators can compare values in a WHERE clause?'],
            }),
            subtopic('null-and-logic', 'NULL and logical conditions', {
              explanation: [
                'SQL conditions use three-valued logic: true, false, or unknown. A NULL is missing or unknown data, so test it with IS NULL.',
              ],
              examples: [
                {
                  title: 'Find unassigned records',
                  explanation: 'IS NULL checks for a missing manager id.',
                  code: 'SELECT employee_id, name\nFROM employees\nWHERE manager_id IS NULL;',
                },
              ],
              keyPoints: ['Use parentheses to make compound boolean logic explicit.'],
              commonMistakes: ['Treating NULL as zero, an empty string, or a regular comparable value.'],
              practiceQuestions: ['Find customers with no phone number and an active account.'],
              interviewQuestions: ['What does SQL return when a comparison involves NULL?'],
            }),
          ],
        ),
        topic(
          'order-limit',
          'Sorting and limiting results',
          'Present result rows in a useful order and request a manageable subset.',
          9,
          {
            explanation: [
              'ORDER BY sorts the final rows by one or more expressions. ASC is the default; DESC reverses the sort direction.',
              'A limit clause restricts how many rows are returned. Syntax differs between database systems, so use the form supported by the target database.',
            ],
            examples: [
              {
                title: 'Newest ten orders',
                explanation: 'Sort newest first, then limit the result size.',
                code: 'SELECT order_id, created_at\nFROM orders\nORDER BY created_at DESC\nLIMIT 10;',
              },
            ],
            keyPoints: [
              'Specify a deterministic tie-breaker when stable ordering matters.',
              'Filtering belongs before ORDER BY and LIMIT.',
            ],
            commonMistakes: [
              'Assuming rows have a natural order without ORDER BY.',
              'Using LIMIT without a stable ordering when repeatable results are required.',
            ],
            practiceQuestions: [
              'Return the five most expensive products, highest price first.',
            ],
            interviewQuestions: [
              'Why should a query use ORDER BY when it also uses LIMIT?',
            ],
          },
          [
            subtopic('sort-direction', 'Sort direction and tie-breakers', {
              explanation: ['Sort by multiple columns to establish a stable order when values can tie.'],
              examples: [
                {
                  title: 'Add a tie-breaker',
                  explanation: 'Sort newest orders first, then by order id.',
                  code: 'SELECT order_id, created_at\nFROM orders\nORDER BY created_at DESC, order_id DESC;',
                },
              ],
              keyPoints: ['Each ORDER BY expression can specify its own direction.'],
              commonMistakes: ['Expecting tied rows to keep the same order across executions.'],
              practiceQuestions: ['Sort employees by department, then by last name.'],
              interviewQuestions: ['How do multiple ORDER BY columns determine row order?'],
            }),
          ],
        ),
      ]),
    ],
  },
  {
    id: 'querying-data',
    title: 'Querying Data',
    description: 'Summarize records and combine related tables to answer richer questions.',
    accent: 'cyan',
    modules: [
      module('summaries-and-groups', 'Summaries & Groups', 'Use aggregate functions and group related rows.', [
        topic(
          'aggregate-functions',
          'Aggregate functions',
          'Summarize many rows into a count, total, or statistical value.',
          11,
          {
            explanation: [
              'Aggregate functions reduce a set of input rows to a single value. Common examples include COUNT, SUM, AVG, MIN, and MAX.',
              'COUNT(*) counts rows. COUNT(column) counts rows where that column is not NULL. Most other aggregates ignore NULL inputs.',
            ],
            examples: [
              {
                title: 'Count and total orders',
                explanation: 'Return a single summary row for all matching orders.',
                code: `SELECT COUNT(*) AS order_count,
       SUM(total_amount) AS revenue
FROM orders
WHERE status = 'paid';`,
              },
            ],
            keyPoints: [
              'Aggregates operate over the rows left after WHERE filtering.',
              'Give aggregate outputs clear aliases.',
            ],
            commonMistakes: [
              'Assuming COUNT(column) counts rows where the column is NULL.',
              'Forgetting that SUM and AVG can return NULL when there are no non-NULL inputs.',
            ],
            practiceQuestions: [
              'Count all products and calculate the average unit price.',
            ],
            interviewQuestions: [
              'What is the difference between COUNT(*) and COUNT(column)?',
            ],
          },
          [
            subtopic('counting-rows', 'Counting rows and values', {
              explanation: [
                'COUNT(*) counts every row in its input set, while COUNT(expression) skips rows where the expression is NULL.',
              ],
              examples: [
                {
                  title: 'Compare row and value counts',
                  explanation: 'The two counts can differ when email is missing.',
                  code: 'SELECT COUNT(*) AS customers,\n       COUNT(email) AS customers_with_email\nFROM customers;',
                },
              ],
              keyPoints: ['COUNT(DISTINCT expression) counts unique non-NULL values.'],
              commonMistakes: ['Using COUNT(column) when the requirement is to count all rows.'],
              practiceQuestions: ['Count total orders and orders with a shipped_at value.'],
              interviewQuestions: ['How does COUNT(DISTINCT column) differ from COUNT(column)?'],
            }),
            subtopic('numeric-aggregates', 'Summing and averaging', {
              explanation: ['SUM and AVG summarize numeric expressions over the current row set.'],
              examples: [
                {
                  title: 'Average order amount',
                  explanation: 'AVG calculates the mean of non-NULL amounts.',
                  code: 'SELECT AVG(total_amount) AS average_order\nFROM orders;',
                },
              ],
              keyPoints: ['Check numeric precision and rounding needs in the application.'],
              commonMistakes: ['Expecting NULL input values to be treated as zero.'],
              practiceQuestions: ['Calculate the maximum and minimum product price.'],
              interviewQuestions: ['How do aggregate functions handle NULL inputs?'],
            }),
          ],
        ),
        topic(
          'group-by',
          'Grouping rows with GROUP BY',
          'Produce one summary row for each distinct group key.',
          13,
          {
            explanation: [
              'GROUP BY partitions input rows into groups with matching key values. Aggregate functions then calculate one result per group.',
              'In standard SQL, every selected expression must either be grouped or aggregated. HAVING filters groups after aggregation, while WHERE filters input rows before grouping.',
            ],
            examples: [
              {
                title: 'Orders per customer',
                explanation: 'Each result row describes one customer group.',
                code: 'SELECT customer_id, COUNT(*) AS order_count\nFROM orders\nGROUP BY customer_id\nHAVING COUNT(*) >= 2;',
              },
            ],
            keyPoints: [
              'GROUP BY creates groups from matching key values.',
              'WHERE filters rows; HAVING filters groups.',
            ],
            commonMistakes: [
              'Selecting an ungrouped, non-aggregated column.',
              'Using HAVING for a simple row condition that belongs in WHERE.',
            ],
            practiceQuestions: [
              'Calculate total sales for each product category.',
            ],
            interviewQuestions: [
              'In what order do WHERE, GROUP BY, and HAVING conceptually apply?',
            ],
          },
          [
            subtopic('group-keys', 'Choosing group keys', {
              explanation: ['Each unique combination of group-key values produces a result group.'],
              examples: [
                {
                  title: 'Group by two dimensions',
                  explanation: 'Summarize sales by month and store.',
                  code: 'SELECT sale_month, store_id, SUM(amount) AS sales\nFROM sales\nGROUP BY sale_month, store_id;',
                },
              ],
              keyPoints: ['Group keys define the detail level of the summary.'],
              commonMistakes: ['Grouping by extra columns and unintentionally splitting summary rows.'],
              practiceQuestions: ['Count orders by customer and order status.'],
              interviewQuestions: ['What does the grain of a grouped result mean?'],
            }),
            subtopic('having-groups', 'Filtering grouped results', {
              explanation: ['HAVING applies a condition to grouped or aggregated results.'],
              examples: [
                {
                  title: 'Keep groups above a threshold',
                  explanation: 'Only departments with at least five employees remain.',
                  code: 'SELECT department_id, COUNT(*) AS headcount\nFROM employees\nGROUP BY department_id\nHAVING COUNT(*) >= 5;',
                },
              ],
              keyPoints: ['A group filter can refer to aggregate calculations.'],
              commonMistakes: ['Moving an aggregate condition into WHERE, where it is not valid.'],
              practiceQuestions: ['Show categories whose average price exceeds 20.'],
              interviewQuestions: ['Why can HAVING use aggregates when WHERE cannot?'],
            }),
          ],
        ),
      ]),
      module('table-relationships', 'Table Relationships', 'Connect related records with explicit join conditions.', [
        topic(
          'inner-joins',
          'Combining tables with INNER JOIN',
          'Return related rows by matching keys across tables.',
          14,
          {
            explanation: [
              'A join combines rows from two sources using a predicate. INNER JOIN keeps only row pairs for which the join condition matches.',
              'Qualify column names with table aliases when multiple sources use the same column name. An explicit ON condition makes the relationship visible.',
            ],
            examples: [
              {
                title: 'Orders with customer names',
                explanation: 'The foreign key on orders matches the customer primary key.',
                code: 'SELECT o.order_id, c.name AS customer_name\nFROM orders AS o\nINNER JOIN customers AS c\n  ON c.id = o.customer_id;',
              },
            ],
            keyPoints: [
              'Use aliases to keep multi-table queries readable.',
              'The ON clause defines how rows relate.',
            ],
            commonMistakes: [
              'Omitting the join condition can create a Cartesian product.',
              'Joining on a non-unique or incorrect key can duplicate or misassociate rows.',
            ],
            practiceQuestions: [
              'Return each order id together with its customer email.',
            ],
            interviewQuestions: [
              'What kinds of rows does an INNER JOIN return?',
              'What can happen when a join condition is missing?',
            ],
          },
          [
            subtopic('join-keys', 'Join keys and aliases', {
              explanation: ['Use the primary-key/foreign-key relationship that represents the intended record association.'],
              examples: [
                {
                  title: 'Qualify duplicate column names',
                  explanation: 'Aliases make each source column unambiguous.',
                  code: 'SELECT c.id AS customer_id, o.id AS order_id\nFROM customers AS c\nINNER JOIN orders AS o\n  ON o.customer_id = c.id;',
                },
              ],
              keyPoints: ['Aliases are especially useful when joining a table to itself.'],
              commonMistakes: ['Assuming similarly named columns are the correct join keys.'],
              practiceQuestions: ['Identify the key pair used to join customers to orders.'],
              interviewQuestions: ['Why are table aliases useful in a join?'],
            }),
            subtopic('join-cardinality', 'Understanding join cardinality', {
              explanation: ['A one-to-many relationship returns a row per matching pair, so a parent may appear multiple times.'],
              examples: [
                {
                  title: 'Orders per customer row',
                  explanation: 'Customers with multiple orders appear once for each order.',
                  code: 'SELECT c.name, o.order_id\nFROM customers AS c\nINNER JOIN orders AS o\n  ON o.customer_id = c.id;',
                },
              ],
              keyPoints: ['The result row count depends on matching cardinality.'],
              commonMistakes: ['Assuming joining tables always preserves the number of rows in one side.'],
              practiceQuestions: ['Explain why a customer with three orders appears three times.'],
              interviewQuestions: ['How can a one-to-many join affect result row counts?'],
            }),
          ],
        ),
      ]),
    ],
  },
];
