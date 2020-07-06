var fs = require ("fs");
var ping = require ("net-ping");
var dns = require ("dns");
var path = require ("path");

class CdnMonitor {
    constructor(config){
        this.domainList = config.domainList;

        this.lastStatus = {};
        this.statusList = {};

        //附加hook列表
        this.hooks = [];

        this.statusFile = config.outputFile || './hostStatus.json';
        this.session = ping.createSession({
            packetSize: config.packetSize || 64,
        });
        this.tryTimes = config.tryTimes || 4;
        this.interval = (config.interval || 30) * 1000;
        this.timerId = null;

        this.addHooks(config.hooks);
        this.updateHostStatus();
        this.registerInterval();
    }

    getARecord(domain){
        return new Promise((resolve, reject) => {
            if(this.isIp(domain)){
                resolve(domain);
            } else {
                dns.resolve4(domain, (err, ip) => {
                    if(err){
                        return reject(err);
                    }
                    resolve(ip[0]);
                });
            }
        });
    }

    sendPingPackage(ip){
        return new Promise((resolve, reject) => {
            this.session.pingHost(ip, (err, remoteHost, sent, rcvd) => {
                var delay = rcvd - sent;
                if(err){
                    resolve(false);
                } else {
                    resolve(delay);
                }
            });
        });
    }

    async ping(ip, count){
        let receivedPkg = 0;
        let delayCount = 0;
        for(let i = 0; i < count; i ++){
            let delay = await this.sendPingPackage(ip);
            if(delay){
                delayCount += delay;
                receivedPkg ++;
            }
        }

        let avgDelay = -1
        if(receivedPkg > 0){
            avgDelay = delayCount / receivedPkg;
        }

        return {
            lost: count - receivedPkg,
            avgDelay: avgDelay,
            online: receivedPkg != 0,
        };
    }

    getTimeString(){
        return (new Date).toLocaleString();
    }

    isIp(str){
        return !!str.match(/^(1\d{2}|2[0-4]\d|25[0-5]|[1-9]\d|[1-9])\.(1\d{2}|2[0-4]\d|25[0-5]|[1-9]\d|\d)\.(1\d{2}|2[0-4]\d|25[0-5]|[1-9]\d|\d)\.(1\d{2}|2[0-4]\d|25[0-5]|[1-9]\d|\d)$/);
    }

    log(message){
        console.log(this.getTimeString() + ' - ' + message);
    }

    isOffline(domain){
        if(this.statusList[domain]){
            return this.statusList[domain].online == false;
        } else {
            return false;
        }
    }

    async updateHostStatus(){
        let nslookupPromises = [];
        this.domainList.forEach((one) => {
            nslookupPromises.push(this.getARecord(one));
        });
        let ipList = await Promise.all(nslookupPromises);
        for(let i = 0; i < ipList.length; i ++){
            let domain = this.domainList[i];
            let ip = ipList[i];

            let pingData = await this.ping(ip, this.tryTimes);
            if(pingData.online){
                this.log(domain + ' [' + ip + ']: ' + pingData.avgDelay.toFixed(0) + ' ms, ' + (pingData.lost / this.tryTimes).toFixed(0) + '% lost.');
                this.statusList[domain] = pingData;
            } else { //离线
                this.log(domain + ' [' + ip + ']: Unreachable.');
                if(!this.isOffline(domain)){
                    pingData.offlineTime = (new Date()).getTime();
                    this.statusList[domain] = pingData;
                }
            }
        }

        this.onSaveStatus(this.statusList);
        this.runHooks();
    }

    onSaveStatus(status){
        if(this.statusFile){
            fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 4));
        }

        this.lastStatus = this.statusList;
        this.statusList = status;
    }

    addHook(file){
        if(fs.existsSync(file)){
            try {
                let modulePath = file;
                if(file[0] != '.' || file[0] != '/'){
                    modulePath = './' + file;
                }
                let hookClass = require(modulePath);
                let hook = new hookClass();
                hook.currentOnline = {};
                this.hooks.push(hook);
                console.log('Hook added: ' + file);
            } catch(e){
                console.error('Cannot add hook ' + file + ': ', e);
            }
        } else {
            console.log('Hook file not exists: ' + file);
        }
    }

    addHooks(fileList){
        if(Array.isArray(fileList)){
            fileList.forEach((file) => {
                this.addHook(file);
            });
        }
    }

    runHooks(){
        this.hooks.forEach((hook) => {
            try {
                if(hook.onUpdateStatus){
                    hook.onUpdateStatus(this.statusList);
                }

                if(hook.domainList){
                    hook.domainList.forEach((domain) => {
                        if(domain in this.statusList){
                            let domainStatus = this.statusList[domain];
                            if(hook.onUpdateDomainStatus){
                                hook.onUpdateDomainStatus(domain, domainStatus);
                            }

                            if(domain in hook.currentOnline){
                                let lastOnlineStatus = hook.currentOnline[domain];
                                if(domainStatus.online != lastOnlineStatus){ //在线状态有变化
                                    if(domainStatus.online){
                                        hook.onHostUp(domain);
                                        hook.currentOnline[domain] = domainStatus.online;
                                    } else { //判断掉线时间
                                        let currentTime = (new Date()).getTime();
                                        if(domainStatus.offlineTime + (hook.offlineDelay * 1000) <= currentTime){
                                            hook.onHostDown(domain);
                                            hook.currentOnline[domain] = domainStatus.online;
                                        }
                                    }
                                }
                            } else {
                                if(hook.firstStatusChangeEvent){
                                    if(domainStatus.online){
                                        hook.onHostUp(domain);
                                    } else {
                                        hook.onHostDown(domain);
                                    }
                                }
                                hook.currentOnline[domain] = domainStatus.online;
                            }
                        }
                    });
                }
            } catch(e){
                console.error(e);
            }
        });
    }

    registerInterval(){
        this.timerId = setInterval(this.updateHostStatus.bind(this), this.interval);
    }
}

module.exports = CdnMonitor;