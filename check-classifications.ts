import { storage } from "./server/storage";

async function checkClassifications() {
  try {
    const emails = await storage.getAllEmails(50);
    
    console.log("\n이메일 분류 확인:");
    console.log("=====================================\n");
    
    const stats = {
      total: emails.length,
      task: 0,
      meeting: 0,
      approval: 0,
      notice: 0,
      unclassified: 0,
    };

    console.log(`총 이메일: ${emails.length}개\n`);
    
    emails.slice(0, 10).forEach(email => {
      console.log(`[${email.id}] ${email.subject}`);
      console.log(`   분류: ${email.classification || '없음'}`);
      console.log(`   신뢰도: ${email.classificationConfidence || '없음'}`);
      console.log(`   처리됨: ${email.isProcessed}`);
      console.log();
      
      if (email.classification === "task") stats.task++;
      else if (email.classification === "meeting") stats.meeting++;
      else if (email.classification === "approval") stats.approval++;
      else if (email.classification === "notice") stats.notice++;
      else stats.unclassified++;
    });
    
    console.log("\n분류 통계:");
    console.log(`  업무(task): ${stats.task}개`);
    console.log(`  회의(meeting): ${stats.meeting}개`);
    console.log(`  결재(approval): ${stats.approval}개`);
    console.log(`  공지(notice): ${stats.notice}개`);
    console.log(`  미분류: ${stats.unclassified}개`);
    
  } catch (error) {
    console.error("오류:", error);
  }
  process.exit(0);
}

checkClassifications();
