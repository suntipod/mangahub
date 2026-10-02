const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = "https://ciykssexuqlsphjrhmbk.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpeWtzc2V4dXFsc3BoanJobWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzI4ODgsImV4cCI6MjEwNjQwODg4OH0.Kvn6vaM37zrBlUWmb_hDE_5nGzsAUYDbJDjSvquryVY";

const client = createClient(url, anonKey);

const JUNK_IDS = [
  'd1ac8d50-f3a7-4c25-ba07-45721680eefc', // Shp App Link
  'b040ee30-f19a-49b2-a53e-6276313b9acc', // Google Search faceless
  '6855f4fa-78d8-4b90-98c9-5b8927181f8f', // MangaHub vercel
  'e9d03088-c8e8-49a2-bb10-2d11673ee7af', // empty source
  '1fc47090-3ddc-4d98-98b8-f33aae0213fa', // empty source
  'cf749ea5-63c0-46ec-8e42-b25781075a10', // ChaiManga root
  'd987a207-c80a-4b54-8144-52cd5190e869', // Go-manga search result
  '18de180e-c4f1-4ebe-951c-c8338e7bdff3', // Smart4m openapp
  '820f1388-c1b9-4de1-a2ae-81c67e3b198b', // Fin page 4
  '0e1bf6e8-39f0-4ab6-a0f9-972f3827dafe', // ntrnaja /manga/
  '7d3f54ce-1e63-4b5f-a4e2-2fc0e8771d88', // pengi /comics
  '30704b68-675e-4991-b2ba-b4bbfdc26d4a', // readtoon root
  '6e650b1e-d2ff-4ec5-82c0-74a88483ba47', // illegal.mdes.go.th
  '653f520c-ca7d-4cac-9a70-48af10bb6641', // popsmanga root
  '51f6e7ef-ed8b-4f0b-8653-82352a8ca6a3', // Google Search murim
  '585d44f1-6b1f-4260-804d-587bb3768a1f', // pengi /topup
  '7ab624f2-5b18-4f51-aa34-d6026de9c1a1', // empty source
  '509408c2-9b08-4cbd-9c40-3dc110295987', // manga-zaa root
  'a698061a-9de7-4b51-8c3a-1a5cbcdc586e', // empty source
  'e6c6b14c-6804-41d5-a400-97025db42a3c', // mynovel /auth
  '22b79e05-20af-44bb-a9b8-dafd7be89892', // mynovel /payments
  '1d041f2c-1666-4baf-9043-45776253ace4', // empty source
  'd82fb557-356a-4501-9d5c-d5df715e283a', // kairew /search
  'e7d7a793-e405-48e1-8bed-eee434267279', // up-manga root
  '45059f83-4920-4e44-8833-946fe36ac0af', // readrealm /search
  'a6848bdc-3d30-4516-a63c-fd16e9b1108d', // empty source
  'cc855abf-3a70-4c8e-bf8d-b8ba4b910068'  // manga00 root
];

// Merges: { survivorId: '...', redundantIds: ['...'], bestTitle: '...', extraNotes: '' }
const MERGE_SPECS = [
  {
    survivorId: '04f4de56-0a0a-4fb6-b92a-973d3a8ad2d3',
    redundantIds: ['d57eeaba-a362-dbac-5f7d-b8738a56e031', '48fc7192-2fb7-4ed1-a6f1-874f51415987'],
    bestTitle: 'Surviving the Game as a Barbarian เอาชีวิตรอดในเกมฉบับคนเถื่อน'
  },
  {
    survivorId: '9754fdba-74b3-44fa-4033-737b20509002',
    redundantIds: ['9035ce65-5e4f-4027-ae7a-be429035ce65'],
    bestTitle: 'Pick Me Up, Infinite Gacha'
  },
  {
    survivorId: 'd4c3a1de-f44e-8fb9-24b3-0e5672205de6',
    redundantIds: ['14aa8b8b-b4c8-4e8b-a062-450014aa8b8b', '45796abb-bacd-498c-9eea-6e28ba8e609c'],
    bestTitle: 'Nano Machine นาโนมาชิน'
  },
  {
    survivorId: 'cb1b895f-eb81-07c7-dace-18914beb1f43',
    redundantIds: ['91e47153-edcd-44f0-ac29-e5a391e47153'],
    bestTitle: 'Mercenary Enrollment พี่ชายบอดี้การ์ด'
  },
  {
    survivorId: '9f5219fd-14bd-4a63-a478-698d6224dfa3',
    redundantIds: ['e3040a23-eb57-4afe-979f-1d05778aa3f8'],
    bestTitle: 'Disastrous Necromancer ราชันนักอัญเชิญวิญญาณ'
  },
  {
    survivorId: '6dc8741c-585e-443f-9c72-959010b10455',
    redundantIds: ['6888a3c3-a429-41f6-8338-26654b45f30a'],
    bestTitle: 'Demonic Evolution'
  },
  {
    survivorId: '45e31216-e546-4f49-8802-b9d1c6d63b89',
    redundantIds: ['de1d57f5-6702-4112-9755-6446475ba71b'],
    bestTitle: 'Solo Leveling'
  },
  {
    survivorId: 'aeacae2a-375f-4c21-8ee2-5ab2b3e3b570',
    redundantIds: ['b6b1abc9-0e9d-424f-a80d-fbef8afe923a'],
    bestTitle: 'Overgeared (Remake)'
  },
  {
    survivorId: 'f5673dae-fe1c-4f88-b4ea-ec8f6b037bb0',
    redundantIds: ['3b741896-508c-4e8b-bd17-b4e9f602de4e'],
    bestTitle: 'Return of the Legend'
  },
  {
    survivorId: '61a6f0ea-4418-4e0e-b2a4-f8d955bb452d',
    redundantIds: ['ac8acef1-898f-46e3-b0ea-7480068d6c0e'],
    bestTitle: 'I Became the Tyrant of a Defense Game ผู้พิชิตเกมป้องกันฐาน'
  },
  {
    survivorId: '7b8df22a-7aad-42e9-b4a1-ea2ac8f5564e',
    redundantIds: ['d92da569-c1b3-4158-a0b0-db91b693d9e1'],
    bestTitle: 'The World’s Best Engineer ยอดสถาปนิกผู้พิทักษ์อาณาจักร'
  },
  {
    survivorId: 'cab8a849-3625-4f9e-be29-8e273dc513ef',
    redundantIds: ['bfb8d2aa-468f-4155-b905-5d1863665c81'],
    bestTitle: 'Return of the SSS-Class Ranker (The SSS-Ranker Returns)'
  },
  {
    survivorId: 'd1102d98-1944-4ca3-b421-b92f359957b2',
    redundantIds: ['45b97ae6-a057-43aa-8973-bc813e5ac5a2'],
    bestTitle: 'Bad Born Blood'
  }
];

// Title & Category cleanups
const CUSTOM_UPDATES = [
  {
    id: '15535f50-2ba0-4281-962f-2f58785eef4f',
    title: 'Mookhyang Dark Lady มุคฮยัง ดาร์กเลดี้'
  },
  {
    id: 'cc2fed84-2ecf-4f74-9674-904aa938ab91',
    title: 'ยีนเทพเจ้า (Super God Gene)'
  },
  {
    id: 'e6f3aa70-c101-457f-b201-0e63312f6c98',
    title: '(20+) เมื่อผมโชว์ของใหญ่ให้แม่แฟนวัย (38) ดู จนลงเอยด้วยการจัดหนักแบบไม่ใส่ถุง',
    notes: '[category:Dojin]'
  },
  {
    id: '01f4906e-f123-4a7a-8b2e-034b44e90c92',
    title: 'HELL MODE อยากเล่นโหดขอโหมดนรก (Hell Mode)'
  },
  {
    id: 'f5c2bc90-4c0b-4e2b-83d0-67ca248d2f23',
    title: 'Revenge of the Iron-Blooded Sword Hound'
  },
  {
    id: 'e2b036e4-5320-4ded-8400-0cab923d9eb2',
    title: 'Myst Might Mayhem'
  },
  {
    id: '3ba78d1c-3e0c-41b3-8761-98ecc640ecdd',
    title: 'Surviving as a Genius on Borrowed Time'
  },
  {
    id: '8db2a324-7762-494f-9947-aab2efba4871',
    title: 'ลูกเขยที่แกร่งสุดในปฐพี (จบSS รอจีนอัพ)'
  }
];

async function main() {
  console.log('=== STARTING SUPABASE DATABASE CLEANUP ===');

  // Step 1: Delete all 27 junk mangas & their sources
  console.log(`\n1. Deleting ${JUNK_IDS.length} junk entries...`);
  const { error: sJunkErr } = await client.from('manga_sources').delete().in('manga_id', JUNK_IDS);
  if (sJunkErr) console.warn('Warning deleting junk sources:', sJunkErr.message);
  
  const { error: mJunkErr } = await client.from('mangas').delete().in('id', JUNK_IDS);
  if (mJunkErr) console.warn('Warning deleting junk mangas:', mJunkErr.message);
  console.log('✓ Junk deletion completed.');

  // Step 2: Handle Pednoi-Ts source 714 transfer to มิติศูนย์กระจายสินค้าในวันสิ้นโลก
  console.log('\n2. Splitting Pednoi-Ts into Hell Mode and Hiding Logistics Center...');
  const { data: pednoiSources } = await client.from('manga_sources').select('*').eq('manga_id', '01f4906e-f123-4a7a-8b2e-034b44e90c92');
  if (pednoiSources) {
    const s714 = pednoiSources.find(s => s.base_url.includes('714'));
    if (s714) {
      // Reassign s714 to cda6b0c6-cf8e-4bd1-b151-3db37f490617
      await client.from('manga_sources').update({ manga_id: 'cda6b0c6-cf8e-4bd1-b151-3db37f490617' }).eq('id', s714.id);
      console.log('✓ Transferred 714 source to มิติศูนย์กระจายสินค้าในวันสิ้นโลก');
    }
  }

  // Step 3: Execute Merges
  console.log('\n3. Merging duplicate manga sources and removing redundant IDs...');
  for (const spec of MERGE_SPECS) {
    // 3a. Fetch sources of redundant mangas
    const { data: redundantSources } = await client.from('manga_sources').select('*').in('manga_id', spec.redundantIds);
    // 3b. Fetch survivor
    const { data: survivorList } = await client.from('mangas').select('*').eq('id', spec.survivorId);
    const survivor = survivorList ? survivorList[0] : null;

    // 3c. Fetch redundant mangas to compare chapters and covers
    const { data: redundantMangas } = await client.from('mangas').select('*').in('id', spec.redundantIds);
    let maxCurrentCh = survivor ? survivor.current_chapter : 1;
    let maxLatestCh = survivor ? survivor.latest_available_chapter : 0;
    let bestCover = survivor ? survivor.cover_url : '';
    let notes = survivor ? survivor.notes : '';

    (redundantMangas || []).forEach(rm => {
      if (rm.current_chapter > maxCurrentCh) maxCurrentCh = rm.current_chapter;
      if (rm.latest_available_chapter > maxLatestCh) maxLatestCh = rm.latest_available_chapter;
      if (!bestCover && rm.cover_url) bestCover = rm.cover_url;
      if (!notes && rm.notes) notes = rm.notes;
    });

    // Update survivor manga
    await client.from('mangas').update({
      title: spec.bestTitle,
      current_chapter: maxCurrentCh,
      latest_available_chapter: maxLatestCh || null,
      cover_url: bestCover,
      notes: notes,
      updated_at: new Date().toISOString()
    }).eq('id', spec.survivorId);

    // Re-link redundant sources to survivor
    if (redundantSources && redundantSources.length > 0) {
      for (const rs of redundantSources) {
        await client.from('manga_sources').update({
          manga_id: spec.survivorId,
          is_primary: false
        }).eq('id', rs.id);
      }
    }

    // Delete redundant mangas
    await client.from('mangas').delete().in('id', spec.redundantIds);
    console.log(`✓ Merged into "${spec.bestTitle}" (removed ${spec.redundantIds.length} duplicate IDs)`);
  }

  // Step 4: Apply Custom Updates (titles & categories)
  console.log('\n4. Applying title and category improvements...');
  for (const upd of CUSTOM_UPDATES) {
    const patch = { title: upd.title, updated_at: new Date().toISOString() };
    if (upd.notes) patch.notes = upd.notes;
    await client.from('mangas').update(patch).eq('id', upd.id);
    console.log(`✓ Updated "${upd.title}"`);
  }

  // Step 5: Verify Final Counts
  console.log('\n5. Verifying final database state...');
  const { data: finalMangas, error: fMErr } = await client.from('mangas').select('*');
  const { data: finalSources, error: fSErr } = await client.from('manga_sources').select('*');

  console.log(`\n🎉 FINAL RESULTS IN SUPABASE:`);
  console.log(`Total Mangas: ${finalMangas ? finalMangas.length : 0}`);
  console.log(`Total Sources: ${finalSources ? finalSources.length : 0}`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
