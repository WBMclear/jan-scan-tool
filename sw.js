/*
 * せどりJANスキャナー用 Service Worker
 *
 * cache-first戦略: キャッシュにあればまずそれを返し、無ければネットワークから
 * 取得してキャッシュに保存する。これによりアプリ本体(HTML/CSS/JS)と
 * html5-qrcodeのCDNスクリプトを一度キャッシュしておけば、電波が全く無い
 * 状態でもアプリの起動・カメラ連続スキャン・履歴・価格記録・グラフ表示が
 * 動作する(Amazon/モノトレーサーへのリンクを開く操作自体はオンラインが必要)。
 *
 * 初回は必ずオンライン状態で一度このアプリを開き、Service Workerの登録と
 * キャッシュ作成を完了させておく必要がある。
 *
 * 注意: index.html やこの sw.js の中身を更新して再配置した場合、
 * cache-first戦略の性質上、古いキャッシュが優先され続けて変更が反映され
 * ないことがある。その場合は下記 CACHE_NAME のバージョン番号
 * (v1 → v2 など)を上げてデプロイし直すこと。
 */
"use strict";

var CACHE_NAME = "jan-scan-tool-cache-v1";

var CACHE_URLS = [
  "./",
  "./index.html",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"
];

self.addEventListener("install", function(event){
  // cache.addAll は1つでも取得に失敗すると全体が失敗してしまい、
  // その結果アプリ本体まで一切キャッシュされずオフライン機能が丸ごと
  // 無効になる。CDN取得の一時的な失敗などでそうならないよう、
  // 1件ずつ cache.add してエラーを分離する。
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(
        CACHE_URLS.map(function(url){
          return cache.add(url).catch(function(err){
            console.warn("キャッシュ取得に失敗しました:", url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){ return key !== CACHE_NAME; })
            .map(function(key){ return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET"){ return; }

  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached){ return cached; }

      return fetch(event.request).then(function(response){
        // 取得できたレスポンスは以後のオフライン利用のためにキャッシュへ追加しておく
        if(response && (response.status === 200 || response.type === "opaque")){
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function(){
        // 完全オフラインでキャッシュにも無い場合は打つ手がないためそのまま失敗させる
        return cached;
      });
    })
  );
});
