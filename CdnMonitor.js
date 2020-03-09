var fs = require ("fs");
var ping = require ("net-ping");
var dns = require ("dns");
var path = require ("path");

class CdnMonitor {
    constructor(config){
        this.domainList = [
            'static-www.isekai.cn'
        ];

        this.statusFile = config.outputFile || './cdnStatus.json';
        this.session = ping.createSession({
            packetSize: config.packetSize || 64,
        });
        this.tryTimes = config.tryTimes || 4;
        this.interval = (config.interval || 30) * 1000;
        this.timerId = null;
        this.updateCdnStatus();
        this.registerInterval();
    }

    getARecord(domain){
        return new Promise((resolve, reject) => {
            dns.resolve4(domain, (err, ip) => {
                if(err){
                    return reject(err);
                }
                resolve(ip);
            });
        });
    }

    ping(ip){
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

    getTimeString(){
        return (new Date).toLocaleString();
    }

    log(message){
        console.log(this.getTimeString() + ' - ' + message);
    }

    async updateCdnStatus(){
        let nslookupPromises = [];
        let statusList = {};
        this.domainList.forEach((one) => {
            nslookupPromises.push(this.getARecord(one));
        });
        let ipList = await Promise.all(nslookupPromises);
        for(let i = 0; i < ipList.length; i ++){
            let domain = this.domainList[i];
            let ip = ipList[i][0];

            let delayCount = 0;
            let receivedPkg = 0;
            for(let i = 0; i < this.tryTimes; i ++){
                let status = await this.ping(ip);
                if(status !== false){
                    delayCount += status;
                    receivedPkg ++;
                }
            }

            let avgDelay = delayCount / receivedPkg;
            let lostPkg = 100 - (receivedPkg * 100 / this.tryTimes);

            if(receivedPkg == 0){
                this.log(domain + ' [' + ip + ']: Unreachable.');
            } else {
                this.log(domain + ' [' + ip + ']: ' + avgDelay.toFixed(0) + ' ms, ' + lostPkg.toFixed(0) + '% lost.');
            }
            statusList[domain] = {delay: avgDelay, loss: lostPkg};
        }

        fs.writeFileSync(this.statusFile, JSON.stringify(statusList, null, 4));
    }

    registerInterval(){
        this.timerId = setInterval(this.updateCdnStatus.bind(this), this.interval);
    }
}

module.exports = CdnMonitor;