// 会员计划选择功能
const membershipCards = document.querySelectorAll('.membership-card');
const activateBtn = document.getElementById('activateBtn');
const closeBtn = document.getElementById('closeBtn');

let selectedPlan = 'monthly'; // 默认选择月度会员

// 会员计划卡片点击事件
membershipCards.forEach(card => {
    card.addEventListener('click', function() {
        // 移除所有活动状态
        membershipCards.forEach(c => c.classList.remove('active'));
        
        // 添加活动状态到当前卡片
        this.classList.add('active');
        
        // 更新选中的计划
        selectedPlan = this.getAttribute('data-plan');
        
        // 添加点击反馈动画
        this.style.transform = 'scale(0.98)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// 立即开通按钮点击事件
activateBtn.addEventListener('click', function() {
    const planName = selectedPlan === 'monthly' ? '月度会员' : '年度会员';
    const planPrice = selectedPlan === 'monthly' ? '¥22' : '¥173';
    
    // 按钮点击动画
    this.style.transform = 'scale(0.95)';
    setTimeout(() => {
        this.style.transform = '';
    }, 150);
    
    // 显示确认信息（实际应用中这里会跳转到支付页面）
    alert(`您选择了：${planName}\n价格：${planPrice}\n\n点击确定后将跳转到支付页面`);
    
    // 这里可以添加实际的支付跳转逻辑
    // window.location.href = '/payment?plan=' + selectedPlan;
});

// 关闭按钮点击事件
closeBtn.addEventListener('click', function() {
    // 添加关闭动画
    const container = document.querySelector('.container');
    container.style.opacity = '0';
    container.style.transform = 'scale(0.95)';
    container.style.transition = 'all 0.3s ease';
    
    setTimeout(() => {
        // 实际应用中这里会关闭弹窗或返回上一页
        alert('页面已关闭');
        // window.history.back();
        // 或者如果是弹窗：modal.close();
    }, 300);
});

// 添加触摸反馈（移动端优化）
if ('ontouchstart' in window) {
    membershipCards.forEach(card => {
        card.addEventListener('touchstart', function() {
            this.style.opacity = '0.8';
        });
        
        card.addEventListener('touchend', function() {
            setTimeout(() => {
                this.style.opacity = '';
            }, 150);
        });
    });
    
    activateBtn.addEventListener('touchstart', function() {
        this.style.opacity = '0.9';
    });
    
    activateBtn.addEventListener('touchend', function() {
        setTimeout(() => {
            this.style.opacity = '';
        }, 150);
    });
}

// 页面加载动画
window.addEventListener('load', function() {
    const container = document.querySelector('.container');
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    container.style.transition = 'all 0.5s ease';
    
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
    }, 100);
});

// 键盘导航支持
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeBtn.click();
    }
    
    // 数字键选择会员计划
    if (e.key === '1') {
        membershipCards[0].click();
    } else if (e.key === '2') {
        membershipCards[1].click();
    }
    
    // Enter键激活
    if (e.key === 'Enter' && document.activeElement === activateBtn) {
        activateBtn.click();
    }
});

// 添加卡片悬停效果（桌面端）
if (window.matchMedia('(hover: hover)').matches) {
    membershipCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            if (!this.classList.contains('active')) {
                this.style.borderColor = '#BDBDBD';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            if (!this.classList.contains('active')) {
                this.style.borderColor = '#E0E0E0';
            }
        });
    });
}





