//This contains backend polling code
//should it be called pollHandler? ...rofl
var snmp = require('snmp-native'),
    db = require('../backend/mongoConn.js');
    //mongoConn = require('../backend/mongoConn.js'),
    //db = mongoConn(process.env.MONGOLAB_URI);

exports.go = function(){
    //for device collection poll and dump response in history collection
    //find all oids on devices to be polled
    db("mb.devices", function(err, devices){
        if(err) console.log("Poll - Device collection: " + err);
        devices.find().each(function(err,device) {
            if(err) console.log("poll.find error: " + err);
            if(device){
                //poll each alarm
                device.alarms.forEach(function(alarm,index,alarms){
                    //poll Oid
                    if(alarm.oid){
                        if(process.env.DEBUG) console.log(device.hostname+" "+alarm.oid);
                        snmps(device.hostname,device.port,device.community,'get',alarm.oid,function(value){
                            logHistory(device.hostname,alarm.oid,Number(value));
                            eventCheck(device,alarm.oid,Number(value));
                        });
                    } else{
                        console.log("Empty alarm element on device "+device.hostname);
                    }
                });
            }
        });
    });
};


function updateState(name,oid,state){
    if(process.env.DEBUG) console.log("Update State"+JSON.stringify(name));
    //var MongoClient = require('mongodb').MongoClient;
    //MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
    db('mb.devices', function(err, devices){
        if(err) console.log("updateStatus error: " + err);
        //this can cause a problem with 2 oids as it can falsely change states that were changed since generation of device change to findandmodify 
        devices.update({hostname:name.hostname}, name, {w:1}, function(){
            if(process.env.DEBUG) console.log(name.hostname + " updated.");
        });
    });  


}
function createEvent(name,oid,state,msg,value){
  //  console.log("createEvent");
    //var MongoClient = require('mongodb').MongoClient;
    //MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
    var time = new Date();
    db('mb.events', function(err, events){
        if(err) console.log("createEvent error: " + err);
        events.insert({device:name,alarmname:oid,state:state,description:msg,datestamp:time,value:value}, function(){
            if(process.env.DEBUG) console.log("Event for " + name + ", " + oid + " created.");
        });
    });
}

//checks to see if this event requires new event
function eventCheck(host,oid,value){
    //var time = new Date();
    //console.log({hostname:name});
                //console.log();
    host.alarms.forEach(function (alarm,index,alarms){
            //console.log("Event Check - Oid found ");
            //determine pos/neg thresholds by testing min(clear,error);
        if(alarm.oid==oid){
            //Haha Input validation fail;
            alarm.error = Number(alarm.error);
            alarm.warning = Number(alarm.warning);
            alarm.clear = Number(alarm.clear);
            //clear less than error means low is good

            if(alarm.clear < alarm.error){
                //console.log("Lower is better "+host.hostname+ "oid:"+ oid);
                //console.log("Error: "+alarm.error+ typeof alarm.error);
                //console.log("Clear: "+alarm.clear+ typeof alarm.clear);
                //console.log(alarm.clear < alarm.error);
                if(value>alarm.error&&alarm.state!='error')
                {
                    createEvent(host.hostname,oid,'error',alarm.errormsg,value);
                    alarm.state = "error";
                    updateState(host,oid,"error");

                }else if(value>alarm.warn&&alarm.state!='warning'&&alarm.state!='error'){
                    createEvent(host.hostname,oid,'warning',alarm.warnmsg,value);
                    alarm.state = "warning";
                    updateState(host,oid,"warning");
                }
                else if(value<alarm.clear && alarm.state!=="clear"){
                    createEvent(host.hostname,oid,'success',alarm.clearmsg,value);
                    alarm.state = "clear";
                    updateState(host,oid,"clear");
                }
            } else {
                //clear higher than error means high is good 
                //console.log("Higher is better "+host.hostname);
                    if(value<alarm.error&&alarm.state!='error')
                    {
                        createEvent(host.hostname,oid,'error',alarm.errormsg,value);
                        alarm.state = "error";
                        updateState(host,oid,"error");

                    }else if(value<alarm.warn&&alarm.state!='warning'&&alarm.state!='error'){
                        createEvent(host.hostname,oid,'warning',alarm.warnmsg,value);
                        alarm.state = "warning";
                        updateState(host,oid,"warning");
                    }
                    else if(value>alarm.clear && alarm.state!=="clear"){
                        createEvent(host.hostname,oid,'success',alarm.clearmsg,value);
                        alarm.state = "clear";
                        updateState(host,oid,"clear");
                    }
            }
        }
    });
}

function logHistory(name,oid,value){
    var time = new Date();
    //var MongoClient = require('mongodb').MongoClient;
    //insert unsorted poll data to history collection
    //MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
    //if(err){console.log("logHistory db fail")} 
    //else{
    db('mb.history', function(err, history){
        if(err) console.log("logHistory error: " + err);
        history.insert({hostname:name,oid:oid,date:time.getTime(),response:value},{w:1},function(){
            if(process.env.DEBUG) console.log("logHistory: event added for " + name + ":" + oid + ":" + value + ".");
        });
    });
}

//exports.snmp = snmps;
var  snmps = function(host,port,community,action,requestedOid,callback){
    //console.log(port);
    //add input validation PLEASE.
    var session = new snmp.Session({ host:host, port:port, community:community});
    if(action ==="get"){
        session.get({oid: requestedOid}, function (error, varbind) {
            if (error) {
                console.log('Fail :( error:'+error+" Host: "+host); // lawl
            } else {
                //console.log(varbind[0].value);
                //TODO Handle error mesages
                callback(varbind[0].value);
            }
            session.close();
        });
    }
    /*
    else if(action ==="getnext"){
        session.getNext({oid: requestedOid}, function (error, varbind) {
            var vb = varbind[0];
            if (error) {
                console.log('Fail :('); // lawl
            } else {
                callback(vb.value);
            }
            session.close();
        });
    }
     else if(action ==="getsubtree"){
        session.getSubtree({oid: requestedOid}, function (error, varbind) {
            var response ="";
            if (error) {
                console.log('Fail :('); // lawl
            } else {
                varbind.forEach(function (vb) {

                    response += vb.value;
                });
                callback(response);
            }
            session.close();
        });
        
    }
    else{
        callback(requestedOid);
        session.close();
    } */   
};
