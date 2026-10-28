const crypto = require('crypto');

// 1. Keyword Mapping for Categories
const CATEGORY_KEYWORDS = {
  'Certification Achievement': ['certification', 'certified', 'certificate', 'exam', 'aws', 'gcp', 'azure', 'cisco', 'comptia'],
  'Internship Completion': ['internship', 'intern', 'co-op', 'placement'],
  'New Job Update': ['new job', 'joined', 'starting', 'hired as', 'new role', 'position', 'software engineer', 'developer', 'manager', 'director'],
  'Learning New Technology': ['learned', 'learning', 'studying', 'mastered', 'course on', 'bootcamp', 'tutorial', 'framework'],
  'Project Completion': ['built', 'created', 'developed', 'launched', 'shipped', 'project', 'application', 'app', 'website'],
  'Promotion / Career Milestone': ['promoted', 'promotion', 'anniversary', 'milestone', 'career achievement'],
  'Networking Success': ['met with', 'networked', 'attended', 'conference', 'meetup', 'connected'],
  'Industry Insight': ['insight', 'thoughts on', 'trends', 'industry', 'market', 'future of'],
  'Award or Recognition': ['award', 'recognized', 'won', 'prize', 'winner', 'honored']
};

// Helper: Extract Entity from Topic
function extractEntity(topic) {
  let entity = topic.toLowerCase();
  
  // Remove common prefix verbs/phrases to isolate the noun
  const prefixesToRemove = [
    'i just', 'i have', 'i', 'completed', 'finished', 'earned', 'got a', 'started an', 
    'started', 'built a', 'built', 'created a', 'created', 'learned about', 'learned', 
    'promoted to', 'won the', 'attended', 'my'
  ];

  for (let prefix of prefixesToRemove) {
    if (entity.startsWith(prefix + ' ')) {
      entity = entity.substring(prefix.length + 1).trim();
    }
  }

  // Capitalize nicely
  return entity.charAt(0).toUpperCase() + entity.slice(1);
}

// Helper: Detect Category
function detectCategory(topic) {
  const lowerTopic = topic.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lowerTopic.includes(kw))) {
      return category;
    }
  }
  return 'Achievement'; // Default
}

// 2. Structural Templates per Style
const STYLES = {
  'Professional': {
    hooks: [
      "I am pleased to share a significant professional update.",
      "A new milestone achieved in my professional journey.",
      "I am excited to announce a major step forward in my career.",
      "Delighted to share an important update regarding my ongoing professional development.",
      "Continuous learning is the key to sustained success, and I have just reached a new benchmark.",
      "I am proud to share the culmination of recent hard work and dedication.",
      "An exciting new chapter in my professional career begins today.",
      "I am thrilled to announce an important professional achievement.",
      "Commitment to excellence always yields results, and I am proud to share this update.",
      "I am happy to announce a recent advancement in my professional capabilities."
    ],
    learnings: [
      "This experience has significantly expanded my strategic capabilities and technical acumen.",
      "I gained valuable insights into industry best practices and innovative methodologies.",
      "The process reinforced my commitment to continuous improvement and operational excellence.",
      "It was a rigorous challenge that ultimately enhanced my problem-solving and leadership skills.",
      "This milestone has broadened my perspective and equipped me with advanced tools for success.",
      "I learned how to effectively navigate complex requirements and deliver high-impact results.",
      "This achievement has sharpened my analytical skills and deepened my domain expertise.",
      "The journey provided me with actionable insights that I will apply to future strategic initiatives.",
      "I have acquired a robust set of skills that will drive value in my upcoming endeavors.",
      "This undertaking strengthened my ability to execute complex projects with precision."
    ],
    closings: [
      "I look forward to applying these insights to drive impactful results.",
      "Thank you to everyone who supported me along the way.",
      "I am eager to leverage this expertise in my upcoming projects.",
      "Excited for the new challenges and opportunities ahead.",
      "I remain committed to driving excellence and innovation.",
      "Thank you to my mentors and colleagues for their continuous guidance.",
      "I am ready to bring this new level of expertise to my team.",
      "Looking forward to connecting with others who share a passion for this field.",
      "I am excited to see how this will positively impact my future work.",
      "Here is to continued growth and professional success."
    ]
  },
  'Storytelling': {
    hooks: [
      "Every great journey starts with a single step, and today I’m celebrating a leap.",
      "If you told me a year ago I would be sharing this, I might not have believed you.",
      "The path to this moment was anything but a straight line.",
      "Growth rarely happens in our comfort zones.",
      "They say the best view comes after the hardest climb.",
      "This hasn't just been a goal; it's been a personal mission.",
      "I still remember the day I decided to take this challenge on.",
      "Behind every success post is a story of late nights and early mornings.",
      "This journey taught me more about resilience than I ever expected.",
      "Sometimes, taking a leap of faith pays off in the best ways possible."
    ],
    learnings: [
      "Along the way, I learned that failure isn't the opposite of success, but a part of it.",
      "The biggest lesson? Consistency and patience will eventually break down any wall.",
      "I discovered a new level of determination within myself that I didn't know existed.",
      "This process challenged my assumptions and forced me to view problems from entirely new angles.",
      "I realized that surrounding yourself with the right people makes the impossible, possible.",
      "The sleepless nights were worth the profound lessons in adaptability and grit.",
      "I learned to embrace the unknown and trust the process, even when it was difficult.",
      "This taught me how to turn obstacles into stepping stones for personal growth.",
      "The journey highlighted the importance of asking for help and learning from mentors.",
      "I walked away with not just new skills, but a completely transformed mindset."
    ],
    closings: [
      "To anyone on a similar path: keep going. It's worth it.",
      "I couldn't have done this without my amazing support system. Thank you.",
      "This chapter is closing, but the story is just getting started.",
      "I’m stepping into the future with immense gratitude and excitement.",
      "If you're currently in the messy middle of your own journey, don't give up.",
      "Thank you for following along and supporting my growth.",
      "I can't wait to see where this road takes me next.",
      "Here’s to embracing the next challenge with open arms.",
      "Grateful for the past, excited for the future.",
      "Let’s connect and share our stories—I'd love to hear what you are working on."
    ]
  },
  'Friendly': {
    hooks: [
      "Hey everyone! 👋 I’m absolutely thrilled to share some exciting news with you all!",
      "Guess what? I finally did it! 🎉",
      "I’ve been keeping a little secret, and today I finally get to share it! 🚀",
      "Happy to pop onto your feed today with a massive personal win! ✨",
      "Big news today! I am so incredibly happy to announce this.",
      "So... this just happened! 🥳",
      "I am on cloud nine right now and just had to share this with my network!",
      "It’s official! 🎉 I couldn't wait to tell you all.",
      "A huge personal update coming your way! 👇",
      "Feeling incredibly grateful today and wanted to share why. 🌟"
    ],
    learnings: [
      "Diving into this was such a blast, and I picked up so many cool new skills.",
      "I learned a ton about this space and had so much fun doing it.",
      "This gave me the chance to really stretch my creative muscles and learn something fresh.",
      "It was definitely challenging at times, but the learning curve was so rewarding!",
      "I walked away with some amazing new insights and a lot of great memories.",
      "The best part was definitely getting to collaborate and learn from some awesome people.",
      "I've gained a whole new appreciation for this field and the work that goes into it.",
      "It pushed me out of my comfort zone in the best way possible!",
      "I learned how to tackle new problems with a huge smile on my face.",
      "This experience totally leveled up my skills and my confidence!"
    ],
    closings: [
      "Drop a comment if you've been working on something similar—I'd love to chat!",
      "A massive THANK YOU to everyone who cheered me on! 🙌",
      "Can't wait to catch up with you all and hear what you've been up to!",
      "Let's celebrate the little wins together! 🥂",
      "Thanks for all the support, friends. You rock! 🤘",
      "I'm so pumped for what's next. Let's go! 🚀",
      "Wishing you all an amazing week ahead! ✨",
      "Feel free to reach out if you want to chat more about this!",
      "Stay tuned for more updates, and keep being awesome!",
      "Cheers to new adventures and continuous learning! 🥳"
    ]
  }
};

// 3. Category Specific Achievement Lines
const CATEGORY_ACHIEVEMENTS = {
  'Certification Achievement': [
    "I have officially earned my [ENTITY] certification.",
    "I successfully passed the exams and am now fully certified in [ENTITY].",
    "After months of preparation, I am proud to hold the [ENTITY] credential.",
    "I've officially completed the rigorous requirements for the [ENTITY] certification.",
    "I am incredibly excited to add the [ENTITY] certification to my professional portfolio."
  ],
  'Internship Completion': [
    "I recently completed an amazing internship working on [ENTITY].",
    "My time as an intern focusing on [ENTITY] has officially come to an incredible end.",
    "I have just wrapped up a deeply rewarding internship experience in [ENTITY].",
    "It is bittersweet to announce the end of my internship journey with [ENTITY].",
    "I successfully completed my internship, where I spent my time diving deep into [ENTITY]."
  ],
  'New Job Update': [
    "I am excited to announce that I have started a new position as [ENTITY]!",
    "I have officially joined an incredible team to work as a [ENTITY].",
    "I’m thrilled to share that I'm taking on a new role focusing on [ENTITY].",
    "Today marks my first day stepping into the world of [ENTITY].",
    "I am extremely proud to announce my new adventure working in [ENTITY]."
  ],
  'Learning New Technology': [
    "I have spent the last few weeks diving deep and mastering [ENTITY].",
    "I'm excited to share that I've leveled up my technical stack by learning [ENTITY].",
    "I have successfully completed my intensive study of [ENTITY].",
    "I've officially added [ENTITY] to my technical toolkit.",
    "I've been exploring the depths of [ENTITY] and have finally built a solid foundation."
  ],
  'Project Completion': [
    "I just launched a brand new project: [ENTITY]!",
    "After a lot of hard work, I have successfully shipped [ENTITY].",
    "I am so proud to unveil my latest work: [ENTITY].",
    "The development phase is finally over, and [ENTITY] is now live.",
    "I have officially brought [ENTITY] from concept to completion."
  ],
  'Promotion / Career Milestone': [
    "I am honored to share that I have achieved a major milestone regarding [ENTITY].",
    "I've been officially promoted and recognized for my work in [ENTITY].",
    "Celebrating a massive career anniversary and milestone related to [ENTITY].",
    "I am incredibly grateful to announce my recent career advancement involving [ENTITY].",
    "Hard work pays off—I have reached a new height in my journey with [ENTITY]."
  ],
  'Networking Success': [
    "I recently had the pleasure of connecting with amazing professionals regarding [ENTITY].",
    "I just wrapped up an incredible networking experience focused on [ENTITY].",
    "I had the opportunity to attend a fantastic event centered around [ENTITY].",
    "I've been engaging in some highly productive conversations about [ENTITY] recently.",
    "I was thrilled to network with industry leaders to discuss [ENTITY]."
  ],
  'Industry Insight': [
    "I've been reflecting heavily on the current trends surrounding [ENTITY].",
    "I want to share some critical thoughts and insights regarding [ENTITY].",
    "The landscape is changing, and I have some predictions about the future of [ENTITY].",
    "I recently conducted a deep dive into the market dynamics of [ENTITY].",
    "There are some fascinating developments happening right now in the world of [ENTITY]."
  ],
  'Award or Recognition': [
    "I am deeply honored to have received recognition for [ENTITY].",
    "I was incredibly humbled to be awarded for my contributions to [ENTITY].",
    "I am thrilled to announce that I've been recognized as a top performer in [ENTITY].",
    "I recently won an amazing award highlighting my work on [ENTITY].",
    "I am so proud to have my efforts in [ENTITY] formally recognized by the community."
  ],
  'Achievement': [
    "I am excited to share a major update: [ENTITY].",
    "I've achieved something I'm very proud of: [ENTITY].",
    "I am thrilled to announce my recent success regarding [ENTITY].",
    "I want to take a moment to celebrate [ENTITY].",
    "I have successfully accomplished a major goal: [ENTITY]."
  ]
};

// Helper: Pick a random element from an array
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

exports.generateFallback = async (topic) => {
  const category = detectCategory(topic);
  const entity = extractEntity(topic);
  
  const results = [];
  
  for (const style of ['Professional', 'Storytelling', 'Friendly']) {
    const parts = STYLES[style];
    const hook = getRandom(parts.hooks);
    const learning = getRandom(parts.learnings);
    const closing = getRandom(parts.closings);
    
    // Get achievement line and inject the entity
    const achievementTemplates = CATEGORY_ACHIEVEMENTS[category] || CATEGORY_ACHIEVEMENTS['Achievement'];
    let achievement = getRandom(achievementTemplates);
    achievement = achievement.replace('[ENTITY]', entity);
    
    // Generate Hashtags
    const hashEntity = entity.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const hashtags = `#${style} #${category.replace(/[^a-zA-Z0-9]/g, '')} #${hashEntity} #CareerGrowth #Tech`;
    
    // Assemble the post
    const text = `${hook}\n\n${achievement}\n\n${learning}\n\n${closing}\n\n${hashtags}`;
    
    results.push({
      type: style,
      text: text
    });
  }
  
  return results;
};
