// 批量注册 20 账号并把它们都加 Song.Han 为好友
// 在 workbench.html 页面的 DevTools Console 粘贴执行（真实作用在你当前浏览器的 localStorage）
(function(){
  var TARGET_UID="usr-muqipi7t94utp9", TARGET_NAME="Song.Han";
  var NAMES=[["周一鸣","zhangwei"],["李思远","lisiyuan"],["王小雨","wangxiaoyu"],["陈雨桐","chenyutong"],["赵启铭","zhaoqiming"],["孙可欣","sunqianxin"],["吴亦辰","wuyichen"],["郑嘉怡","zhengjiayi"],["冯泽楷","fengzekai"],["褚静姝","chujingshu"],["蒋明轩","jiangmingxuan"],["沈雨桐","shenyutong"],["韩沛霖","hanpeilin"],["曹语嫣","caoyuyan"],["邓子睿","dengzuirui"],["许知微","xuzhiwei"],["彭皓宇","penghaoyu"],["萧南乔","xiaonanqiao"],["程晚舟","chengwanzhou"],["苏念卿","sunianqing"]];
  var PWD="wb2026";
  var ok=0, already=0, fail=0, res=[];
  NAMES.forEach(function(pair,i){
    var username=pair[1], nickname=pair[0];
    var r=wbUser.register(username,nickname,PWD);
    if(!r.ok){fail++;res.push("#"+(i+1)+" "+username+" 注册失败："+r.err);return;}
    ok++;
    var f=wbFriends.addFriend({userId:TARGET_UID,nickname:TARGET_NAME});
    if(f.ok){res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，已加 Song.Han 好友");}
    else if(f.err==="已是好友"){already++;res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，已是好友");}
    else{fail++;res.push("#"+(i+1)+" "+username+" "+nickname+" → 注册成功，加好友失败："+f.err);}
  });
  // 直接读 Song.Han 的好友表键（addFriend 回写口径），不受 switchTo 影响
  var friendKey="wb-friends::user::"+TARGET_UID;
  var raw=null, map={};
  try{ raw=localStorage.getItem(friendKey); if(raw) map=JSON.parse(raw); }catch(e){}
  console.log("========== 批量注册结果 ==========");
  res.forEach(function(x){console.log(x);});
  console.log("注册成功 "+ok+" / 已是好友 "+already+" / 失败 "+fail);
  console.log("Song.Han 好友表共 "+Object.keys(map).length+" 人（应包含全部 20 新账号）");
  wbUser.switchTo(TARGET_UID);
  if(typeof render==="function")render();
  return {ok:ok, already:already, failed:fail, songhanFriends:Object.keys(map).length};
})();
