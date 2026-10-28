const SKILL_DICTIONARY = {
  Programming: ['javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust', 'typescript', 'php', 'swift', 'kotlin', 'bash', 'scala', 'dart', 'html', 'css'],
  Databases: ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'cassandra', 'elasticsearch', 'oracle', 'dynamodb', 'mariadb', 'neo4j', 'couchbase', 'firebase'],
  Cloud: ['aws', 'azure', 'gcp', 'google cloud', 'ibm cloud', 'heroku', 'digitalocean', 'snowflake', 'databricks'],
  DevOps: ['docker', 'kubernetes', 'jenkins', 'ansible', 'terraform', 'ci/cd', 'github actions', 'gitlab ci', 'circleci', 'puppet', 'chef', 'vagrant', 'nginx', 'apache'],
  Frameworks: ['react', 'angular', 'vue', 'spring', 'django', 'flask', 'express', 'node.js', 'next.js', 'nest', 'laravel', 'ruby on rails', 'asp.net', '.net', 'flutter', 'react native'],
  Testing: ['jest', 'mocha', 'cypress', 'selenium', 'junit', 'pytest', 'cucumber', 'playwright', 'puppeteer', 'unit testing', 'integration testing', 'tdd', 'bdd', 'jasmine', 'karma'],
  Analytics: ['pandas', 'numpy', 'scipy', 'tableau', 'power bi', 'looker', 'google analytics', 'hadoop', 'spark', 'kafka', 'data warehousing', 'machine learning', 'deep learning', 'nlp'],
  Tools: ['git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'trello', 'asana', 'slack', 'postman', 'swagger', 'figma', 'webpack', 'babel', 'linux'],
  SoftSkills: ['leadership', 'communication', 'teamwork', 'problem solving', 'critical thinking', 'agile', 'scrum', 'kanban', 'time management', 'mentoring', 'collaboration', 'presentation', 'analytical']
};

const SKILL_ALIASES = {
  'javascript': ['js'],
  'node.js': ['node', 'nodejs'],
  'ci/cd': ['continuous integration', 'continuous deployment'],
  'react': ['reactjs', 'react.js'],
  'vue': ['vuejs', 'vue.js'],
  'next.js': ['nextjs', 'next'],
  'amazon web services': ['aws'],
  'google cloud platform': ['gcp']
};

/**
 * Normalizes dictionary strings for display (e.g. "node.js" -> "Node.js", "c++" -> "C++")
 */
function formatSkillName(skill) {
  const customMapping = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'c++': 'C++',
    'c#': 'C#',
    'php': 'PHP',
    'html': 'HTML',
    'css': 'CSS',
    'sql': 'SQL',
    'mysql': 'MySQL',
    'postgresql': 'PostgreSQL',
    'mongodb': 'MongoDB',
    'aws': 'AWS',
    'gcp': 'GCP',
    'ci/cd': 'CI/CD',
    'node.js': 'Node.js',
    'next.js': 'Next.js',
    '.net': '.NET',
    'asp.net': 'ASP.NET',
    'api': 'API',
    'tdd': 'TDD',
    'bdd': 'BDD',
    'nlp': 'NLP'
  };
  
  if (customMapping[skill]) return customMapping[skill];
  
  return skill.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extracts keywords from text based on the dictionary.
 * Uses careful boundaries to match terms like .NET and C++
 */
function extractKeywordsFromText(text) {
  if (!text) return {};
  
  const searchSpace = text.toLowerCase();
  const extracted = {};
  
  for (const [category, skills] of Object.entries(SKILL_DICTIONARY)) {
    const foundInCategory = [];
    
    for (const skill of skills) {
      const aliases = SKILL_ALIASES[skill] || [];
      const termsToSearch = [skill, ...aliases];
      let hasMatch = false;

      for (const term of termsToSearch) {
        const escapedSkill = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Look for the skill, bounded by non-alphanumeric (or string ends)
        // This correctly matches "C++" but prevents "java" matching inside "javascript"
        const regex = new RegExp(`(?:^|[^a-zA-Z0-9])(${escapedSkill})(?:[^a-zA-Z0-9]|$)`, 'i');
        
        if (regex.test(searchSpace)) {
          hasMatch = true;
          break;
        }
      }
      
      if (hasMatch) {
        foundInCategory.push(formatSkillName(skill));
      }
    }
    
    if (foundInCategory.length > 0) {
      extracted[category] = foundInCategory;
    }
  }
  
  return extracted;
}

/**
 * Flattens the extracted keywords into a single array
 */
function flattenKeywords(extracted) {
  let all = [];
  for (const skills of Object.values(extracted)) {
    all = all.concat(skills);
  }
  return [...new Set(all)];
}

module.exports = {
  extractKeywordsFromText,
  flattenKeywords,
  SKILL_DICTIONARY
};
