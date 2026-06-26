/**
 * Smart SQL Mock Data Simulator Engine
 * Generates highly realistic and context-aware mock data based on SQL column name patterns
 * and resolved source table/column domains from the workspace schema.
 */

const errorMessages = [
  "NullReferenceException: Object reference not set to an instance of an object.",
  "SqlException: Connection timeout expired while executing command.",
  "AuthException: Invalid token signature or expired session key.",
  "FileNotFoundException: Could not load file or assembly 'System.Web'.",
  "IndexOutOfRangeException: Index was outside the bounds of the array.",
  "TimeoutException: The operation has timed out after 30 seconds."
];

const errorCalls = [
  "AuthService.login()",
  "PaymentController.processCheckout()",
  "CourseRepository.getCourseDetailsAsync()",
  "VideoWatchingLogsController.saveLog()",
  "DatabaseConnector.openConnection()",
  "UserSessionManager.validateSession()"
];

const errorCodes = ["ERR_CONNECTION_REFUSED", "500 Internal Server Error", "403 Forbidden", "401 Unauthorized", "502 Bad Gateway"];
const fullNames = ["Ahmet Yılmaz", "Elif Kaya", "Mehmet Demir", "Ayşe Nur", "Deniz Şahin", "Can Polat", "Zeynep Aslan"];
const userNames = ["yusuf_dev", "elif_kaya", "m_demir", "ayse_nur", "deniz_s", "can_polat", "zeynep_a"];
const emails = ["yusuf@academy.hub", "elif.kaya@outlook.com", "m.demir@gmail.com", "ayse@noemaverse.com", "deniz.sahin@domain.com", "can@net.tr", "zeynep@aslan.io"];
const ipAddresses = ["192.168.1.104", "88.243.12.98", "127.0.0.1", "54.213.43.11", "10.0.0.5"];

// Extended domain-specific dictionary from SQL folder structure
const domainDictionary = {
  blogs: {
    title: [
      "Yapay Zekanın Geleceği ve LLM Modelleri",
      "Sürdürülebilir Yazılım Geliştirme Yaklaşımları",
      "SQL ve NoSQL Veritabanı Karşılaştırması",
      "Vite.js ile Hızlı ve Efektif Proje Kurulumu",
      "CSS Grid ve Flexbox ile Modern Layout Tasarımı"
    ],
    summary: [
      "Bu yazımızda modern yapay zeka modellerinin yazılım geliştirme süreçlerine etkisini inceliyoruz.",
      "Veritabanı optimizasyonu ve indeksleme pratikleri hakkında kapsamlı rehber.",
      "Vite ve modern build araçlarının getirdiği hız avantajları.",
      "Premium ve modern kullanıcı arayüzleri geliştirme teknikleri."
    ],
    coverimageurl: [
      "/assets/images/blogs/ai-future.jpg",
      "/assets/images/blogs/db-opt.jpg",
      "/assets/images/blogs/frontend.jpg",
      "/assets/images/blogs/modern-css.jpg"
    ],
    authorname: ["Yusuf Demir", "Ahmet Yılmaz", "Elif Kaya", "Zeynep Aslan"],
    blogshoworder: [1, 2, 3, 4, 5],
    type: ["Teknoloji", "Tasarım", "Yazılım Mimari", "Duyuru"]
  },
  blogdetail: {
    content: [
      "Yapay zeka modelleri gün geçtikçe daha entegre çalışmaya başlıyor...",
      "İyi bir veritabanı şeması tasarlamak, uygulamanın yaşam süresi boyunca performansı doğrudan belirler...",
      "Vite projemizde TypeScript desteğini en yüksek seviyede yapılandırarak kod kalitemizi artırıyoruz..."
    ]
  },
  courses: {
    coursename: [
      "Next.js ile Modern Web Geliştirme",
      "C# ve Microservice Mimarisi",
      "Docker ve Kubernetes 101",
      "SQL & Veritabanı Tasarımı",
      "Yapay Zeka ve Makine Öğrenmesi"
    ],
    courseimg: [
      "/assets/images/courses/nextjs.jpg",
      "/assets/images/courses/microservices.jpg",
      "/assets/images/courses/docker.jpg",
      "/assets/images/courses/sql-basics.jpg"
    ],
    coursedescription: [
      "A'dan Z'ye modern web geliştirme süreçleri ve pratik uygulamalar.",
      "Dağıtık sistemlerin tasarımı ve mikroservis entegrasyonu.",
      "Container teknolojileri ile CI/CD süreçlerinin yönetimi.",
      "İlişkisel veritabanı şemaları, normalizasyon ve ileri SQL sorguları."
    ]
  },
  coursedetails: {
    coursedescription: [
      "Bu ders kapsamında ileri seviye Next.js mimarisini ve App Router yapısını öğreneceksiniz.",
      "Dockerize edilmiş mikroservislerin Kubernetes üzerinde yönetilmesi ve loglanması.",
      "Index yapıları, query plan okuma ve performans tuning adımları."
    ]
  },
  courseseason: {
    seasonname: ["2026 Bahar Dönemi", "2026 Güz Dönemi", "Hızlandırılmış Yaz Kampı", "Kış Kampı Özel Sezonu"]
  },
  videowatchinglogs: {
    lessonname: [
      "Giriş ve Kurulum",
      "Temel SELECT Sorguları",
      "Veri Tipleri ve Tablolar",
      "GROUP BY ve Agregasyonlar",
      "JOIN İşlemleri ile Birleştirme",
      "Trigger ve Stored Procedure Tanımları"
    ],
    videopartsubj: [
      "Giriş videosu ve nvm kurulumu",
      "JOIN tipleri ve aralarındaki farklar",
      "Aggregate fonksiyonlarının performans analizi",
      "Stored procedure yazımı ve parametre geçirme"
    ],
    secondstart: [0, 45, 120, 240, 300],
    secondend: [120, 180, 320, 500, 620],
    minutestart: [0, 1, 2, 4, 5],
    minuteend: [2, 3, 5, 8, 10],
    isrequire: [1, 0, 1, 1, 0],
    requirementstatus: ["Zorunlu", "İsteğe Bağlı", "Zorunlu", "Zorunlu", "İsteğe Bağlı"]
  },
  vibe: {
    vibename: ["Pozitif", "Motivasyon", "Odaklanma", "Yaratıcılık", "Sakinlik", "Enerji Dolu"],
    vibetype: ["Core", "Focus", "Creative", "Calm", "Energy"],
    score: [85, 92, 78, 95, 88, 91]
  },
  dreams: {
    title: [
      "Uçsuz bucaksız bir okyanus ve gökyüzü",
      "Bulutların üzerinde serbest uçuş",
      "Antik bir tapınakta kayıp geçit arayışı",
      "Geleceğin neon ve siberpunk şehri"
    ],
    description: [
      "Rüyamda mavi bir gökyüzü altında dalgaların üzerinde kolayca yürüyebildiğimi gördüm.",
      "Kendimi fütüristik bir şehirde uçan araçların ve gökdelenlerin arasında buldum.",
      "Tarihi belirsiz tozlu bir kütüphanede sürekli kayıp bir parşömeni arıyordum."
    ]
  },
  surveys: {
    title: ["Eğitim Memnuniyet Anketi", "Haftalık Durum Değerlendirmesi", "Yeni Özellik Geri Bildirimi"]
  },
  questions: {
    questiontext: [
      "Kursun anlatım hızını ve örneklerini nasıl buldunuz?",
      "Platformun arayüz tasarımı sizin için ne kadar kullanışlı?",
      "Bir sonraki eğitimde hangi konuyu detaylı görmek istersiniz?",
      "İçeriklerin derinliği hedeflerinize uygun mu?"
    ]
  },
  answers: {
    answertext: [
      "Çok başarılı ve açıklayıcı, beğendim.",
      "Geliştirilmesi gereken bazı yerler var.",
      "Kesinlikle çok faydalı buldum ve tavsiye ederim.",
      "Giriş seviyesi için uygun ancak daha derin olabilirdi."
    ]
  },
  llmprovider: {
    providername: ["OpenAI", "Google DeepMind", "Anthropic", "Meta AI", "Mistral AI"],
    providercode: ["OAI", "GDM", "ANT", "META", "MST"]
  },
  llmmodel: {
    modelname: ["gpt-4o", "gemini-1.5-pro", "claude-3-5-sonnet", "llama-3-70b", "mistral-large-2"],
    contextwindow: ["128k", "2m", "200k", "8k", "32k"]
  },
  systemparams: {
    paramkey: ["MaxUploadSize", "EnableNotification", "DefaultTheme", "SessionTimeout", "LlmRetryCount"],
    paramvalue: ["50MB", "true", "dark", "3600", "3"]
  }
};

export function generateMockValue(columnName, rowIndex, sourceTable = "", sourceColumn = "") {
  const name = columnName.toLowerCase();
  const index = (rowIndex + Math.floor(Math.random() * 3)) % 7;

  // 1. Try to match from Domain-Specific Dictionary first (if sourceTable and sourceColumn are resolved)
  if (sourceTable && sourceColumn) {
    const tableKey = sourceTable.toLowerCase().replace(/[\[\]]/g, "");
    const columnKey = sourceColumn.toLowerCase().replace(/[\[\]]/g, "");
    if (domainDictionary[tableKey] && domainDictionary[tableKey][columnKey]) {
      const list = domainDictionary[tableKey][columnKey];
      return list[rowIndex % list.length];
    }
  }

  // 2. Try matching from Domain Dictionary using column name only
  for (const [tbl, cols] of Object.entries(domainDictionary)) {
    if (cols[name]) {
      const list = cols[name];
      return list[rowIndex % list.length];
    }
  }

  // 3. Fallback to generic patterns
  // Error / Exception / Log Patterns
  if (name.includes("error") || name.includes("exception") || name.includes("log") || name.includes("fail")) {
    if (name.includes("message") || name.includes("msg") || name.includes("text") || name.includes("desc")) {
      return errorMessages[rowIndex % errorMessages.length];
    }
    if (name.includes("call") || name.includes("method") || name.includes("action") || name.includes("func") || name.includes("source")) {
      return errorCalls[rowIndex % errorCalls.length];
    }
    if (name.includes("code") || name.includes("num") || name.includes("status")) {
      return errorCodes[rowIndex % errorCodes.length];
    }
  }

  // User / Identity
  if (name.includes("email") || name.includes("mail")) {
    return emails[index % emails.length];
  }
  if (name.includes("username") || name.includes("user_name") || name.includes("login") || name.includes("nick")) {
    return userNames[index % userNames.length];
  }
  if (name.includes("fullname") || name.includes("full_name") || (name.includes("name") && (name.includes("user") || name.includes("student") || name.includes("teacher")))) {
    return fullNames[index % fullNames.length];
  }

  // IPs
  if (name.includes("ip") || name.includes("host") || name.includes("address")) {
    return ipAddresses[rowIndex % ipAddresses.length];
  }

  // System status
  if (name.includes("status") || name.includes("state")) {
    return rowIndex % 2 === 0 ? "Active" : "Inactive";
  }

  // Dates and Timestamps
  if (name.includes("date") || name.includes("time") || name.includes("created") || name.includes("updated")) {
    const d = new Date();
    d.setDate(d.getDate() - rowIndex);
    return d.toISOString().replace("T", " ").substring(0, 19);
  }

  // General Name/Title
  if (name.includes("name") || name.includes("title")) {
    return fullNames[index % fullNames.length];
  }

  // IDs
  if (name.endsWith("id") || name.includes("_id")) {
    return 100 + rowIndex * 12 + Math.floor(Math.random() * 5);
  }

  // Numbers (durations, counts)
  if (name.includes("second") || name.includes("minute") || name.includes("duration") || name.includes("count") || name.includes("time") || name.includes("number")) {
    return 10 + rowIndex * 45 + Math.floor(Math.random() * 8);
  }

  // Final generic fallback
  return `Value_${rowIndex + 1}`;
}
